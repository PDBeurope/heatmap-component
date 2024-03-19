import { clamp, cloneDeep, isNil, merge, range, round } from 'lodash';
import { Color } from './color';
import * as d3 from './d3-modules';
import { Data, Image } from './data';
import { Domain } from './domain';
import { Downsampler } from './downsampling';
import { ExtensionInstance, ExtensionInstanceRegistration, HotmapExtension } from './extensions/extension';
import { MarkerExtension } from './extensions/marker';
import { DefaultTooltipExtensionParams, TooltipExtension, TooltipExtensionParams } from './extensions/tooltip';
import { Box, Scales, scaleDistance } from './scales';
import { State } from './state';
import { Refresher, attrd, getSize, minimum, nextIfChanged, removeElement } from './utils';


// TODO: Should: publish on npm before we move this to production, serve via jsdelivr
// TODO: Should: think in more depth what could happen when changing data type with filters, providers, etc. already set
// TODO: Should: reasonable level of customizability
// TODO: Should: docs
// TODO: Could: various zoom modes (horizontal, vertical, both, none...)
// TODO: Would: try setting `downsamplingPixelsPerRect` dynamically, based on rendering times
// TODO: Would: Smoothen zooming and panning with mouse wheel?



/** Class names of DOM elements */
export const Class = {
    MainDiv: 'hotmap-main-div',
    CanvasDiv: 'hotmap-canvas-div',
    Marker: 'hotmap-marker',
    MarkerX: 'hotmap-marker-x',
    MarkerY: 'hotmap-marker-y',
    TooltipBox: 'hotmap-tooltip-box',
    TooltipContent: 'hotmap-tooltip-content',
    PinnedTooltipBox: 'hotmap-pinned-tooltip-box',
    PinnedTooltipContent: 'hotmap-pinned-tooltip-content',
    PinnedTooltipPin: 'hotmap-pinned-tooltip-pin',
    PinnedTooltipClose: 'hotmap-pinned-tooltip-close',
    Overlay: 'hotmap-overlay',
    OverlayShade: 'hotmap-overlay-shade',
    OverlayMessage: 'hotmap-overlay-message',
} as const;

const MIN_ZOOMED_DATAPOINTS = 1;
const MIN_ZOOMED_DATAPOINTS_HARD = 1;

/** Avoid zooming to things like 0.4999999999999998 */
const ZOOM_EVENT_ROUNDING_PRECISION = 9;

/** Only allow zooming with scrolling gesture when Ctrl key (or Meta key, i.e. Command/Windows) is pressed.
 * If `false`, zooming is allowed always, but Ctrl or Meta key makes it faster. */
const ZOOM_REQUIRE_CTRL = false;

const ZOOM_SENSITIVITY = 1;
const PAN_SENSITIVITY = 0.6;

/** Initial size set to canvas (doesn't really matter because it will be immediately resized to the real size) */
const CANVAS_INIT_SIZE = { width: 100, height: 100 };

/** Size of rectangle in pixels, when showing gaps is switched on (for smaller sizes off, to avoid Moire patterns) */
const MIN_PIXELS_PER_RECT_FOR_GAPS = 2;


export type DataDescription<TX, TY, TItem> = {
    /** Array of X values assigned to columns, from left to right ("column names") */
    xDomain: TX[],
    /** Array of Y values assigned to rows, from top to bottom ("row names") */
    yDomain: TY[],
    /** Data items to show in the heatmap (each item is visualized as a rectangle) */
    items: TItem[],
    /** X values for the data items (either an array with the X values (must have the same length as `items`), or a function that computes X value for given item)  */
    x: ((dataItem: TItem, index: number) => TX) | TX[],
    /** Y values for the data items (either an array with the Y values (must have the same length as `items`), or a function that computes Y value for given item)  */
    y: ((dataItem: TItem, index: number) => TY) | TY[],
}

/** Types of input parameters of provider functions (that are passed to setTooltip etc.) */
type ProviderParams<TX, TY, TItem> = [d: TItem, x: TX, y: TY, xIndex: number, yIndex: number]

/** A function that returns something (of type `TResult`) for a data item (such functions are passed to setTooltip, setColor etc.). */
export type Provider<TX, TY, TItem, TResult> = (...args: ProviderParams<TX, TY, TItem>) => TResult

/** Emitted on data-item-related events (hover, click...) */
export type ItemEventParam<TX, TY, TItem> = {
    datum: TItem,
    x: TX,
    y: TY,
    xIndex: number,
    yIndex: number,
    sourceEvent: MouseEvent,
} | undefined

/** Emitted on zoom event */
export type ZoomEventParam<TX, TY, TItem> = {
    /** Continuous X index corresponding to the left edge of the viewport */
    xMinIndex: number,
    /** Continuous X index corresponding to the right edge of the viewport */
    xMaxIndex: number,
    /** (Only if the X domain is numeric, strictly sorted (asc or desc), and linear!) Continuous X value corresponding to the left edge of the viewport. */
    xMin: TX extends number ? number : undefined,
    /** (Only if the X domain is numeric, strictly sorted (asc or desc), and linear!) Continuous X value corresponding to the right edge of the viewport. */
    xMax: TX extends number ? number : undefined,

    /** X index of the first (at least partially) visible column` */
    xFirstVisibleIndex: number,
    /** X index of the last (at least partially) visible column` */
    xLastVisibleIndex: number,
    /** X value of the first (at least partially) visible column` */
    xFirstVisible: TX,
    /** X value of the last (at least partially) visible column` */
    xLastVisible: TX,

    /** Continuous Y-index corresponding to the top edge of the viewport */
    yMinIndex: number,
    /** Continuous Y-index corresponding to the bottom edge of the viewport */
    yMaxIndex: number,
    /** (Only if the Y domain is numeric, strictly sorted (asc or desc), and linear!) Continuous Y value corresponding to the top edge of the viewport. */
    yMin: TY extends number ? number : undefined,
    /** (Only if the Y domain is numeric, strictly sorted (asc or desc), and linear!) Continuous Y value corresponding to the bottom edge of the viewport. */
    yMax: TY extends number ? number : undefined,

    /** Y index of the first (at least partially) visible row` */
    yFirstVisibleIndex: number,
    /** Y index of the last (at least partially) visible row` */
    yLastVisibleIndex: number,
    /** Y value of the first (at least partially) visible row` */
    yFirstVisible: TY,
    /** Y value of the last (at least partially) visible row` */
    yLastVisible: TY,
} | undefined


const DefaultColor = Color.fromString('#888888');
export const DefaultColorProvider = () => DefaultColor;
export const DefaultNumericColorProviderFactory = (min: number, max: number) => Color.createScale('YlOrRd', [min, max]);

/** Controls how X axis values align with the columns when using `Heatmap.zoom` and `Heatmap.events.zoom` (position of a value on X axis can be aligned to the left edge/center/right edge of the column showing that value) */
export type XAlignmentMode = 'left' | 'center' | 'right'
/** Controls how Y axis values align with the rows when using `Heatmap.zoom` and `Heatmap.events.zoom` (position of a value on Y axis is aligned to the top edge/center/bottom edge of the row showing that value) */
export type YAlignmentMode = 'top' | 'center' | 'bottom'

export type VisualParams = typeof DefaultVisualParams;

export const DefaultVisualParams = {
    /** Horizontal gap between neighboring columns in pixels. If both `xGapPixels` and `xGapRelative` are non-null, the smaller final gap value will be used. The margin before the first and after the last column is half of the gap between columns. */
    xGapPixels: 2 as number | null,
    /** Horizontal gap between neighboring columns relative to (column width + gap). If both `xGapPixels` and `xGapRelative` are non-null, the smaller final gap value will be used. The margin before the first and after the last column is half of the gap between columns. */
    xGapRelative: 0.1 as number | null,
    /** Vertical gap between neighboring rows in pixels. If both `yGapPixels` and `yGapRelative` are non-null, the smaller final gap value will be used. The margin before the first and after the last row is half of the gap between rows. */
    yGapPixels: 2 as number | null,
    /** Vertical gap between neighboring rows relative to (row height + gap). If both `yGapPixels` and `yGapRelative` are non-null, the smaller final gap value will be used. The margin before the first and after the last row is half of the gap between rows. */
    yGapRelative: 0.1 as number | null,

    /** Radius for round corners of the "markers" (rectangles outlining currently hovered data item, column, and row), in pixels. */
    markerCornerRadius: 1 as number,

    // More config via CSS:
    // .hotmap-canvas-div { background-color: none; }...
};



export class Heatmap<TX, TY, TItem> {
    private readonly state: State<TX, TY, TItem> = new State();

    get events() { return this.state.events; }

    private readonly _behaviors: ExtensionInstance<any>[] = [];
    registerBehavior<TParams extends {}>(behavior: HotmapExtension<TParams>, params?: Partial<TParams>): ExtensionInstanceRegistration<TParams> {
        const behaviors = this._behaviors;
        const behaviorInstance: ExtensionInstance<TParams> = behavior.create(this.state, params);
        behaviorInstance.register();
        behaviors.push(behaviorInstance);
        return {
            update(newParams: Partial<TParams>) {
                behaviorInstance.update(newParams);
            },
            unregister() {
                removeElement(behaviors, behaviorInstance);
                behaviorInstance.unregister();
            },
        };
    }

    private readonly extensions: {
        tooltip?: ExtensionInstanceRegistration<TooltipExtensionParams<TX, TY, TItem>>,
    } = {};

    /** Create a new `Heatmap` and set `data` */
    static create<TX, TY, TItem>(data: DataDescription<TX, TY, TItem>): Heatmap<TX, TY, TItem> {
        return new this(data);
    }

    /** Create a new `Heatmap` with dummy data */
    static createDummy(nColumns: number = 20, nRows: number = 20): Heatmap<number, number, number> {
        // return new this(makeRandomData2(2000, 20));
        return new this(makeRandomData2(nColumns, nRows));
        // return new this(makeRandomData2(2e5, 20));
    }

    private constructor(data: DataDescription<TX, TY, TItem>) {
        this.setData(data);
        if (this.state.data.isNumeric) {
            const dataRange = Data.getRange(this.state.data as Data<number>);
            const colorProvider = DefaultNumericColorProviderFactory(dataRange.min, dataRange.max);
            (this as unknown as Heatmap<TX, TY, number>).setColor(colorProvider);
        }
        this.registerBehavior(MarkerExtension);
        this.extensions.tooltip = this.registerBehavior(TooltipExtension);
        // setTimeout(() => this.extensions.tooltip?.update({ pinnable: false }), 5000);
        // setTimeout(() => this.extensions.tooltip?.update({ tooltipProvider: ()=>'ahoj' }), 5000);
    }


    /** Clear all the contents of the root div. */
    remove(): void {
        if (!this.state.dom) return;
        this.state.dom.rootDiv.select('*').remove();
    }

    /** Render this heatmap in the given DIV element */
    render(divElementOrId: HTMLDivElement | string): this {
        if (this.state.dom) {
            console.error(`This ${this.constructor.name} has already been rendered in element`, this.state.dom.rootDiv.node());
            throw new Error(`This ${this.constructor.name} has already been rendered. Cannot render again.`);
        }
        console.time('Hotmap render');

        const rootDiv: d3.Selection<HTMLDivElement, any, any, any> = (typeof divElementOrId === 'string') ? d3.select(`#${divElementOrId}`) : d3.select(divElementOrId);
        if (rootDiv.empty()) throw new Error('Failed to initialize, wrong div ID?');
        this.remove();

        const mainDiv = attrd(rootDiv.append('div'), {
            class: Class.MainDiv,
            style: { position: 'relative', width: '100%', height: '100%' },
        });

        const canvasDiv = attrd(mainDiv.append('div'), {
            class: Class.CanvasDiv,
            style: { position: 'absolute', width: '100%', height: '100%' },
        });

        const canvas = attrd(canvasDiv.append('canvas'), {
            width: CANVAS_INIT_SIZE.width,
            height: CANVAS_INIT_SIZE.height,
            style: { position: 'absolute', width: '100%', height: '100%' },
        });

        const ctx = canvas.node()?.getContext('2d');
        if (ctx) this.state.ctx = ctx;
        else throw new Error('Failed to initialize canvas');

        this.state.boxes = {
            visWorld: Box.create(0, 0, this.state.data.nColumns, this.state.data.nRows),
            wholeWorld: Box.create(0, 0, this.state.data.nColumns, this.state.data.nRows),
            canvas: Box.create(0, 0, CANVAS_INIT_SIZE.width, CANVAS_INIT_SIZE.height), // To be changed via 'resize' event subscription
        };

        this.events.resize.subscribe(box => {
            if (!box) return;
            this.state.boxes.canvas = box;
            this.state.boxes.canvas = box;
            this.state.scales = Scales(this.state.boxes);
            if (this.state.ctx) {
                this.state.ctx.canvas.width = Box.width(box);
                this.state.ctx.canvas.height = Box.height(box);
            }
            this.requestDraw();
        });

        const svg = attrd(canvasDiv.append('svg'), {
            style: { position: 'absolute', width: '100%', height: '100%' },
        });
        this.state.dom = { rootDiv, mainDiv, canvasDiv, canvas, svg };

        for (const eventName in this.handlers) {
            svg.on(eventName, e => this.handlers[eventName as keyof typeof this.handlers](e));
            // wheel event must be subscribed before setting zoom
        }

        this.emitResize();
        d3.select(window).on('resize.resizehotmapcanvas', () => this.emitResize());

        this.addZoomBehavior();

        console.timeEnd('Hotmap render');
        return this;
    }

    private getColorArray(): Image {
        // console.time('get all colors')
        const image = Image.create(this.state.data.nColumns, this.state.data.nRows);
        for (let iy = 0; iy < this.state.data.nRows; iy++) {
            for (let ix = 0; ix < this.state.data.nColumns; ix++) {
                const item = Data.getItem(this.state.data, ix, iy);
                if (item === undefined) continue; // keep transparent black
                const color = this.state.colorProvider(item, this.state.xDomain.values[ix], this.state.yDomain.values[iy], ix, iy);
                const c = (typeof color === 'string') ? Color.fromString(color) : color;
                Color.toImage(c, image, ix, iy);
            }
        }
        // console.timeEnd('get all colors')
        return image;
    }

    private emitResize() {
        if (!this.state.dom) return;
        const size = getSize(this.state.dom.canvas);
        const box = Box.create(0, 0, size.width, size.height);
        this.events.resize.next(box);
    }

    private setRawData(data: Data<TItem>): this {
        this.state.data = data;
        this.state.downsampler = undefined;
        if (this.state.boxes) {
            const newWholeWorld = Box.create(0, 0, data.nColumns, data.nRows);
            const xScale = Box.width(newWholeWorld) / Box.width(this.state.boxes.wholeWorld);
            const yScale = Box.height(newWholeWorld) / Box.height(this.state.boxes.wholeWorld);
            this.state.boxes.wholeWorld = newWholeWorld;
            this.state.boxes.visWorld = Box.clamp({
                xmin: this.state.boxes.visWorld.xmin * xScale,
                xmax: this.state.boxes.visWorld.xmax * xScale,
                ymin: this.state.boxes.visWorld.ymin * yScale,
                ymax: this.state.boxes.visWorld.ymax * yScale
            }, newWholeWorld, MIN_ZOOMED_DATAPOINTS_HARD, MIN_ZOOMED_DATAPOINTS_HARD);
            this.state.scales = Scales(this.state.boxes);
        }
        this.adjustZoomExtent();
        this.requestDraw();
        return this;
    }

    setData<TX_, TY_, TItem_>(data: DataDescription<TX_, TY_, TItem_>): Heatmap<TX_, TY_, TItem_> {
        const self = this as unknown as Heatmap<TX_, TY_, TItem_>;
        const { items, x, y, xDomain, yDomain } = data;
        const nColumns = xDomain.length;
        const nRows = yDomain.length;
        const array = new Array<TItem_ | undefined>(nColumns * nRows).fill(undefined);
        const xs = (typeof x === 'function') ? items.map(x) : x;
        const ys = (typeof y === 'function') ? items.map(y) : y;
        self.state.xDomain = Domain.create(xDomain);
        self.state.yDomain = Domain.create(yDomain);
        let warnedX = false;
        let warnedY = false;
        for (let i = 0; i < items.length; i++) {
            const d = items[i];
            const x = xs[i];
            const y = ys[i];
            const ix = self.state.xDomain.index.get(x);
            const iy = self.state.yDomain.index.get(y);
            if (ix === undefined) {
                if (!warnedX) {
                    console.warn('Some data items map to X values out of the X domain:', d, 'maps to X', x);
                    warnedX = true;
                }
            } else if (iy === undefined) {
                if (!warnedY) {
                    console.warn('Some data items map to Y values out of the Y domain:', d, 'maps to Y', y);
                    warnedY = true;
                }
            } else if (self.state.filter !== undefined && !self.state.filter(d, x, y, ix, iy)) {
                // skipping this item
            } else {
                array[nColumns * iy + ix] = d;
            }
        }
        const isNumeric = items.every(d => typeof d === 'number') as (TItem_ extends number ? true : false);
        self.state.originalData = data;
        self.setRawData({ items: array, nRows, nColumns, isNumeric });
        return self;
    }

    /** Change X and Y domain without changing the data (can be used for reordering or hiding columns/rows). */
    setDomains(xDomain: TX[] | undefined, yDomain: TY[] | undefined): this {
        this.setData({
            ...this.state.originalData,
            xDomain: xDomain ?? this.state.originalData.xDomain,
            yDomain: yDomain ?? this.state.originalData.yDomain,
        });
        return this;
    }

    /** Set a color provider function (takes data item and position and returns color).
     * Example:
     * ```
     * hm.setColor((d, x, y, xIndex, yIndex) => d >= 0.5 ? 'black' : '#ff0000');
     * ```
     * Use `Color.createScale` to create efficient color providers for big numeric data:
     * ```
     * hm.setColor(Color.createScale('YlOrRd', [0, 100]));
     * ```
     */
    setColor(colorProvider: (...args: ProviderParams<TX, TY, TItem>) => string | Color): this {
        this.state.colorProvider = colorProvider;
        this.state.downsampler = undefined;
        this.requestDraw();
        return this;
    }

    setTooltip(tooltipProvider: ((...args: ProviderParams<TX, TY, TItem>) => string) | 'default' | null): this {
        if (tooltipProvider === 'default') {
            this.extensions.tooltip?.update({ tooltipProvider: DefaultTooltipExtensionParams.tooltipProvider });
        } else {
            this.extensions.tooltip?.update({ tooltipProvider });

        }
        return this;
    }

    setFilter(filter: ((...args: ProviderParams<TX, TY, TItem>) => boolean) | undefined): this {
        this.state.filter = filter;
        this.setData(this.state.originalData); // reapplies filter
        return this;
    }

    setVisualParams(params: Partial<VisualParams>): this {
        this.state.visualParams = merge(cloneDeep(this.state.visualParams), params);
        this.requestDraw();
        return this;
    }

    /** Controls how column/row indices and names map to X and Y axes. */
    setAlignment(x: XAlignmentMode | undefined, y: YAlignmentMode | undefined): this {
        if (x) this.state.xAlignment = x;
        if (y) this.state.yAlignment = y;
        this.emitZoom();
        return this;
    }

    private readonly drawer = Refresher(() => this._draw());
    private requestDraw() {
        this.drawer.requestRefresh();
    }

    /** Do not call directly! Call `requestDraw` instead to avoid browser freezing. */
    private _draw() {
        if (!this.state.dom) return;
        const xResolution = Box.width(this.state.boxes.canvas) / this.state.downsamplingPixelsPerRect;
        const yResolution = Box.height(this.state.boxes.canvas) / this.state.downsamplingPixelsPerRect;
        this.state.downsampler ??= Downsampler.fromImage(this.getColorArray());
        // console.time('downsample')
        const downsampledImage = Downsampler.getDownsampled(this.state.downsampler, {
            x: xResolution * Box.width(this.state.boxes.wholeWorld) / (Box.width(this.state.boxes.visWorld)),
            // y: this.state.data.nRows,
            y: yResolution * Box.height(this.state.boxes.wholeWorld) / (Box.height(this.state.boxes.visWorld)),
        });
        console.log('downsampled', downsampledImage.nColumns, downsampledImage.nRows);
        // console.timeEnd('downsample')
        return this.drawThisImage(downsampledImage, this.state.data.nColumns / downsampledImage.nColumns, this.state.data.nRows / downsampledImage.nRows);
    }

    private drawTheseData(data: Data<TItem>, xScale: number) {
        if (!this.state.ctx) return;
        this.state.ctx.clearRect(0, 0, Box.width(this.state.boxes.canvas), Box.height(this.state.boxes.canvas));
        const width = scaleDistance(this.state.scales.worldToCanvas.x, 1) * xScale;
        const height = scaleDistance(this.state.scales.worldToCanvas.y, 1);
        const xHalfGap = xScale === 1 ? 0.5 * this.getXGap(width) : 0;
        const yHalfGap = 0.5 * this.getYGap(height);
        const colFrom = Math.floor(this.state.boxes.visWorld.xmin / xScale);
        const colTo = Math.ceil(this.state.boxes.visWorld.xmax / xScale); // exclusive

        for (let iy = 0; iy < data.nRows; iy++) {
            for (let ix = colFrom; ix < colTo; ix++) {
                const item = Data.getItem(data, ix, iy);
                if (item === undefined) continue;
                const color = this.state.colorProvider(item, this.state.xDomain.values[ix], this.state.yDomain.values[iy], ix, iy);
                this.state.ctx.fillStyle = (typeof color === 'string') ? color : Color.toString(color);
                const x = this.state.scales.worldToCanvas.x(ix * xScale);
                const y = this.state.scales.worldToCanvas.y(iy);
                this.state.ctx.fillRect(x + xHalfGap, y + yHalfGap, width - 2 * xHalfGap, height - 2 * yHalfGap);
            }
        }
    }

    _canvasImage?: Image;
    private getCanvasImage(): Image {
        if (!this.state.ctx) throw new Error('`getCanvasImage` should only be called when canvas is initialized');
        const w = Math.floor(this.state.ctx.canvas.width);
        const h = Math.floor(this.state.ctx.canvas.height);
        if (this._canvasImage && this._canvasImage.nColumns === w && this._canvasImage.nRows === h) {
            Image.clear(this._canvasImage);
        } else {
            this._canvasImage = Image.create(w, h);
        }
        return this._canvasImage;
    }

    _canvasImageData?: ImageData;
    private getCanvasImageData(): ImageData {
        if (!this.state.ctx) throw new Error('`getCanvasImageData` should only be called when canvas is initialized');
        const w = Math.floor(this.state.ctx.canvas.width);
        const h = Math.floor(this.state.ctx.canvas.height);
        if (this._canvasImageData && this._canvasImageData.width === w && this._canvasImageData.height === h) {
            return this._canvasImageData;
        } else {
            this._canvasImageData = new ImageData(w, h);
            return this._canvasImageData;
        }
    }
    private drawThisImage(image: Image, xScale: number, yScale: number) {
        if (!this.state.ctx || !this.state.dom) return;
        // console.time(`drawThisImage`)
        this.state.ctx.clearRect(0, 0, Box.width(this.state.boxes.canvas), Box.height(this.state.boxes.canvas));
        const rectWidth = scaleDistance(this.state.scales.worldToCanvas.x, 1) * xScale;
        const rectHeight = scaleDistance(this.state.scales.worldToCanvas.y, 1) * yScale;
        const showXGaps = Box.width(this.state.boxes.canvas) > MIN_PIXELS_PER_RECT_FOR_GAPS * Box.width(this.state.boxes.visWorld);
        const showYGaps = Box.height(this.state.boxes.canvas) > MIN_PIXELS_PER_RECT_FOR_GAPS * Box.height(this.state.boxes.visWorld);
        const xHalfGap = showXGaps ? 0.5 * this.getXGap(rectWidth) : 0;
        const yHalfGap = showYGaps ? 0.5 * this.getYGap(rectHeight) : 0;
        const globalOpacity =
            (showXGaps ? 1 : (1 - this.getXGap(rectWidth) / rectWidth))
            * (showYGaps ? 1 : (1 - this.getYGap(rectHeight) / rectHeight));
        this.state.dom.canvas.style('opacity', globalOpacity); // This compensates for not showing gaps by lowering opacity (when scaled)
        const colFrom = clamp(Math.floor(this.state.boxes.visWorld.xmin / xScale), 0, image.nColumns);
        const colTo = clamp(Math.ceil(this.state.boxes.visWorld.xmax / xScale), 0, image.nColumns); // exclusive
        const rowFrom = clamp(Math.floor(this.state.boxes.visWorld.ymin / yScale), 0, image.nRows);
        const rowTo = clamp(Math.ceil(this.state.boxes.visWorld.ymax / yScale), 0, image.nRows); // exclusive

        const canvasImage = this.getCanvasImage();
        for (let iy = rowFrom; iy < rowTo; iy++) {
            const y = this.state.scales.worldToCanvas.y(iy * yScale);
            const yFrom = y + yHalfGap;
            const yTo = y + rectHeight - yHalfGap;
            for (let ix = colFrom; ix < colTo; ix++) {
                const x = this.state.scales.worldToCanvas.x(ix * xScale);
                const xFrom = x + xHalfGap;
                const xTo = x + rectWidth - xHalfGap;
                const color = Color.fromImage(image, ix, iy);
                Image.addRect(canvasImage, xFrom, yFrom, xTo, yTo, color);
            }
        }
        const imageData = this.getCanvasImageData();
        Image.toImageData(canvasImage, imageData);
        this.state.ctx.putImageData(imageData, 0, 0);
        // console.timeEnd(`drawThisImage`)
    }

    /** Return horizontal gap between rectangles, in canvas pixels */
    private getXGap(colWidthOnCanvas: number): number {
        const gap1 = isNil(this.state.visualParams.xGapPixels) ? undefined : this.state.visualParams.xGapPixels;
        const gap2 = isNil(this.state.visualParams.xGapRelative) ? undefined : this.state.visualParams.xGapRelative * colWidthOnCanvas;
        return clamp(minimum(gap1, gap2) ?? 0, 0, colWidthOnCanvas);
    }
    /** Return vertical gap between rectangles, in canvas pixels */
    private getYGap(rowHeightOnCanvas: number): number {
        const gap1 = isNil(this.state.visualParams.yGapPixels) ? undefined : this.state.visualParams.yGapPixels;
        const gap2 = isNil(this.state.visualParams.yGapRelative) ? undefined : this.state.visualParams.yGapRelative * rowHeightOnCanvas;
        return clamp(minimum(gap1, gap2) ?? 0, 0, rowHeightOnCanvas);
    }

    private addZoomBehavior() {
        if (!this.state.dom) return;
        if (this.state.zoomBehavior) {
            // Remove any old behavior
            this.state.zoomBehavior.on('zoom', null);
        }
        this.state.zoomBehavior = d3.zoom();
        this.state.zoomBehavior.filter(e => (e instanceof WheelEvent) ? (this.wheelAction(e).kind === 'zoom') : true);
        this.state.zoomBehavior.wheelDelta(e => {
            // Default function is: -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1)
            const action = this.wheelAction(e);
            return action.kind === 'zoom' ? ZOOM_SENSITIVITY * action.delta : 0;
        });
        this.state.zoomBehavior.on('zoom', e => {
            this.state.boxes.visWorld = this.zoomTransformToVisWorld(e.transform);
            this.state.scales = Scales(this.state.boxes);
            this.events.hover.next(this.getPointedItem(e.sourceEvent));
            this.emitZoom();
            this.requestDraw();
        });
        this.state.dom.svg.call(this.state.zoomBehavior as any);
        // .on('wheel', e => e.preventDefault()); // Prevent fallback to normal scroll when on min/max zoom
        this.events.resize.subscribe(() => this.adjustZoomExtent());
    }
    private adjustZoomExtent() {
        if (!this.state.zoomBehavior) return;
        this.state.zoomBehavior.translateExtent([[this.state.boxes.wholeWorld.xmin, -Infinity], [this.state.boxes.wholeWorld.xmax, Infinity]]);
        const canvasWidth = Box.width(this.state.boxes.canvas);
        const wholeWorldWidth = Box.width(this.state.boxes.wholeWorld);
        const minZoom = canvasWidth / wholeWorldWidth; // zoom-out
        const maxZoom = Math.max(canvasWidth / MIN_ZOOMED_DATAPOINTS, minZoom); // zoom-in
        this.state.zoomBehavior.scaleExtent([minZoom, maxZoom]);
        this.state.zoomBehavior.extent([[this.state.boxes.canvas.xmin, this.state.boxes.canvas.ymin], [this.state.boxes.canvas.xmax, this.state.boxes.canvas.ymax]]);
        const currentZoom = this.visWorldToZoomTransform(this.state.boxes.visWorld);
        this.state.zoomBehavior.transform(this.state.dom?.svg as any, currentZoom);
    }

    private zoomTransformToVisWorld(transform: { k: number, x: number, y: number }): Box {
        return {
            ...this.state.boxes.visWorld, // preserve Y zoom
            xmin: (this.state.boxes.canvas.xmin - transform.x) / transform.k,
            xmax: (this.state.boxes.canvas.xmax - transform.x) / transform.k,
        };
    }

    private visWorldToZoomTransform(visWorld: Box): d3.ZoomTransform {
        const k = (this.state.boxes.canvas.xmax - this.state.boxes.canvas.xmin) / (visWorld.xmax - visWorld.xmin);
        const x = this.state.boxes.canvas.xmin - k * visWorld.xmin;
        const y = 0;
        return new d3.ZoomTransform(k, x, y);
    }

    private zoomParamFromVisWorld(box: Box | undefined): ZoomEventParam<TX, TY, TItem> {
        if (!box) return undefined;

        const xMinIndex_ = round(box.xmin, ZOOM_EVENT_ROUNDING_PRECISION); // This only holds for xAlignment left
        const xMaxIndex_ = round(box.xmax, ZOOM_EVENT_ROUNDING_PRECISION); // This only holds for xAlignment left
        const xFirstVisibleIndex = clamp(Math.floor(xMinIndex_), 0, this.state.data.nColumns - 1);
        const xLastVisibleIndex = clamp(Math.ceil(xMaxIndex_) - 1, 0, this.state.data.nColumns - 1);

        const yMinIndex_ = round(box.ymin, ZOOM_EVENT_ROUNDING_PRECISION); // This only holds for yAlignment top
        const yMaxIndex_ = round(box.ymax, ZOOM_EVENT_ROUNDING_PRECISION); // This only holds for yAlignment top
        const yFirstVisibleIndex = clamp(Math.floor(yMinIndex_), 0, this.state.data.nRows - 1);
        const yLastVisibleIndex = clamp(Math.ceil(yMaxIndex_) - 1, 0, this.state.data.nRows - 1);

        const xShift = indexAlignmentShift(this.state.xAlignment);
        const yShift = indexAlignmentShift(this.state.yAlignment);

        return {
            xMinIndex: xMinIndex_ + xShift,
            xMaxIndex: xMaxIndex_ + xShift,
            xMin: Domain.interpolateValue(this.state.xDomain, xMinIndex_ + xShift),
            xMax: Domain.interpolateValue(this.state.xDomain, xMaxIndex_ + xShift),
            xFirstVisibleIndex,
            xLastVisibleIndex,
            xFirstVisible: this.state.xDomain.values[xFirstVisibleIndex],
            xLastVisible: this.state.xDomain.values[xLastVisibleIndex],

            yMinIndex: yMinIndex_ + yShift,
            yMaxIndex: yMaxIndex_ + yShift,
            yMin: Domain.interpolateValue(this.state.yDomain, yMinIndex_ + yShift),
            yMax: Domain.interpolateValue(this.state.yDomain, yMaxIndex_ + yShift),
            yFirstVisibleIndex,
            yLastVisibleIndex,
            yFirstVisible: this.state.yDomain.values[yFirstVisibleIndex],
            yLastVisible: this.state.yDomain.values[yLastVisibleIndex],
        };

    }

    private emitZoom(): void {
        if (this.state.boxes.visWorld) {
            nextIfChanged(this.events.zoom, this.zoomParamFromVisWorld(this.state.boxes.visWorld));
        }
    }

    /** Enforce change of zoom and return the zoom value after the change */
    zoom(z: Partial<ZoomEventParam<TX, TY, TItem>> | undefined): ZoomEventParam<TX, TY, TItem> {
        if (!this.state.dom || !this.state.zoomBehavior) return undefined;

        const visWorldBox = Box.clamp({
            xmin: this.getZoomRequestIndexMagic('x', 'Min', z) ?? this.state.boxes.wholeWorld.xmin,
            xmax: this.getZoomRequestIndexMagic('x', 'Max', z) ?? this.state.boxes.wholeWorld.xmax,
            ymin: this.getZoomRequestIndexMagic('y', 'Min', z) ?? this.state.boxes.wholeWorld.ymin,
            ymax: this.getZoomRequestIndexMagic('y', 'Max', z) ?? this.state.boxes.wholeWorld.ymax,
        }, this.state.boxes.wholeWorld, MIN_ZOOMED_DATAPOINTS_HARD, MIN_ZOOMED_DATAPOINTS_HARD);

        const xScale = Box.width(this.state.boxes.canvas) / Box.width(visWorldBox);
        const yScale = Box.height(this.state.boxes.canvas) / Box.height(visWorldBox);

        const transform = d3.zoomIdentity.scale(xScale).translate(-visWorldBox.xmin, 0);
        this.state.zoomBehavior.transform(this.state.dom.svg as any, transform);
        return this.zoomParamFromVisWorld(visWorldBox);
    }

    /** Return current zoom */
    getZoom(): ZoomEventParam<TX, TY, TItem> {
        return this.zoomParamFromVisWorld(this.state.boxes.visWorld);
    }

    private getZoomRequestIndexMagic(axis: 'x' | 'y', end: 'Min' | 'Max', z: Partial<ZoomEventParam<TX, TY, TItem>>): number | undefined {
        if (isNil(z)) return undefined;

        const fl = end === 'Min' ? 'First' : 'Last';
        const index = z[`${axis}${end}Index`];
        const value = z[`${axis}${end}`] as TX | TY | undefined;
        const visIndex = z[`${axis}${fl}VisibleIndex`];
        const visValue = z[`${axis}${fl}Visible`];
        const domain = this.state[`${axis}Domain`];
        const alignment = this.state[`${axis}Alignment`];

        if ([index, value, visIndex, visValue].filter(v => !isNil(v)).length > 1) {
            console.warn(`You called zoom function with more that one of these conflicting options: ${axis}${end}Index, ${axis}${end}, ${axis}${fl}VisibleIndex, ${axis}${fl}Visible. Only the first one (in this order of precedence) will be considered.`);
        }

        if (!isNil(index)) {
            return index - indexAlignmentShift(alignment);
        }
        if (!isNil(value)) {
            const interpolatedIndex = Domain.interpolateIndex(domain, value);
            if (!isNil(interpolatedIndex)) {
                return interpolatedIndex - indexAlignmentShift(alignment);
            } else {
                throw new Error(`${axis}${end} option is not applicable for zoom function, because the ${axis.toUpperCase()} domain is not numeric or not sorted. Use one of these options instead: ${axis}${end}Index, ${axis}${fl}VisibleIndex, ${axis}${fl}Visible.`);
            }
        }
        if (!isNil(visIndex)) {
            if (Math.floor(visIndex) !== visIndex) throw new Error(`${axis}${fl}VisibleIndex must be an integer, not ${visIndex}`);
            return fl === 'First' ? visIndex : visIndex + 1;
        }
        if (!isNil(visValue)) {
            const foundIndex = domain.index.get(visValue as any);
            if (!isNil(foundIndex)) {
                return fl === 'First' ? foundIndex : foundIndex + 1;
            } else {
                console.warn(`The provided value of ${axis}${fl}Visible (${visValue}) is not in the ${axis.toUpperCase()} domain.`);

                return undefined;
            }
        }
        return undefined;
    }

    private getPointedItem(event: MouseEvent | undefined): ItemEventParam<TX, TY, TItem> {
        if (!event) {
            return undefined;
        }
        const xIndex = Math.floor(this.state.scales.canvasToWorld.x(event.offsetX));
        const yIndex = Math.floor(this.state.scales.canvasToWorld.y(event.offsetY));
        const datum = Data.getItem(this.state.data, xIndex, yIndex);
        if (!datum) {
            return undefined;
        }
        const x = this.state.xDomain.values[xIndex];
        const y = this.state.yDomain.values[yIndex];
        return { datum, x, y, xIndex, yIndex, sourceEvent: event };
    }

    private showScrollingMessage() {
        if (!this.state.dom) return;
        if (!this.state.dom.mainDiv.selectAll(`.${Class.Overlay}`).empty()) return;

        const overlay = attrd(this.state.dom.mainDiv.append('div'), { class: Class.Overlay });
        attrd(overlay.append('div'), { class: Class.OverlayShade });
        attrd(overlay.append('div'), { class: Class.OverlayMessage })
            .text('Press Ctrl and scroll to apply zoom');
        setTimeout(() => overlay.remove(), 750);
    }

    private wheelAction(e: WheelEvent): { kind: 'ignore' } | { kind: 'showHelp' } | { kind: 'zoom', delta: number } | { kind: 'pan', deltaX: number, deltaY: number } {
        const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
        const isVertical = Math.abs(e.deltaX) < Math.abs(e.deltaY);

        const modeSpeed = (e.deltaMode === 1) ? 25 : e.deltaMode ? 500 : 1; // scroll in lines vs pages vs pixels
        const speedup = ZOOM_REQUIRE_CTRL ? 1 : (this.state.lastWheelEvent.ctrlKey || this.state.lastWheelEvent.metaKey ? 10 : 1);

        if (isHorizontal) {
            return { kind: 'pan', deltaX: -e.deltaX * modeSpeed * speedup, deltaY: 0 };
        }

        if (isVertical) {
            if (this.state.lastWheelEvent.shiftKey) {
                return { kind: 'pan', deltaX: -e.deltaY * modeSpeed * speedup, deltaY: 0 };
            }
            if (ZOOM_REQUIRE_CTRL && !this.state.lastWheelEvent.ctrlKey && !this.state.lastWheelEvent.metaKey) {
                return (Math.abs(e.deltaY) * modeSpeed >= 5) ? { kind: 'showHelp' } : { kind: 'ignore' };
            }
            return { kind: 'zoom', delta: -e.deltaY * 0.002 * modeSpeed * speedup };
            // Default function for zoom behavior is: -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1)
        }

        return { kind: 'ignore' };
    }

    private readonly handlers = {
        mousemove: (e: MouseEvent) => this.events.hover.next(this.getPointedItem(e)),
        mouseleave: (e: MouseEvent) => this.events.hover.next(undefined),
        click: (e: MouseEvent) => this.events.click.next(this.getPointedItem(e)),
        wheel: (e: WheelEvent) => {
            if (!this.state.dom) return;
            e.preventDefault(); // TODO ???

            // Magic to handle touchpad scrolling on Mac (when user lifts fingers from touchpad, but the browser is still getting wheel events)
            const now = Date.now();
            const absDelta = Math.max(Math.abs(e.deltaX), Math.abs(e.deltaY));
            if (now > this.state.lastWheelEvent.timestamp + 150 || absDelta > this.state.lastWheelEvent.absDelta + 1) {
                // Starting a new gesture
                this.state.lastWheelEvent.ctrlKey = e.ctrlKey;
                this.state.lastWheelEvent.shiftKey = e.shiftKey;
                this.state.lastWheelEvent.altKey = e.altKey;
                this.state.lastWheelEvent.metaKey = e.metaKey;
            }
            this.state.lastWheelEvent.timestamp = now;
            this.state.lastWheelEvent.absDelta = absDelta;

            if (this.state.zoomBehavior) {
                const action = this.wheelAction(e);
                if (action.kind === 'pan') {
                    const shiftX = PAN_SENSITIVITY * scaleDistance(this.state.scales.canvasToWorld.x, action.deltaX);
                    this.state.zoomBehavior.duration(1000).translateBy(this.state.dom.svg as any, shiftX, 0);
                }
                if (action.kind === 'showHelp') {
                    this.showScrollingMessage();
                }
            }
        },
    } satisfies Record<string, (e: any) => any>;
}


function makeRandomData(nColumns: number, nRows: number): DataDescription<number, number, number> {
    const raw = Data.createRandom(nColumns, nRows);
    return {
        items: raw.items as number[],
        x: (d, i) => i % nColumns,
        y: (d, i) => Math.floor(i / nColumns),
        xDomain: range(nColumns),
        yDomain: range(nRows),
    };
}

function makeRandomData2(nColumns: number, nRows: number): DataDescription<number, number, number> {
    const data = makeRandomData(nColumns, nRows);
    return {
        ...data,
        items: data.items.map((d, i) => (d * 0.5) + (i % nColumns / nColumns * 0.5)),
    };
}

function indexAlignmentShift(alignment: XAlignmentMode | YAlignmentMode) {
    if (alignment === 'left' || alignment === 'top') return 0;
    if (alignment === 'center') return -0.5;
    return -1;
}
