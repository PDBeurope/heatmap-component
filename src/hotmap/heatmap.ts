import * as d3 from 'd3';
import { clamp, cloneDeep, isNil, merge, round } from 'lodash';
import { BehaviorSubject } from 'rxjs';
import { Color } from './color';
import { Data, Image } from './data';
import { Domain } from './domain';
import { Downsampler } from './downsampling';
import { Box, Boxes, Scales, XY, scaleDistance } from './scales';
import { Refresher, attrd, formatDataItem, getSize, minimum, nextIfChanged } from './utils';


// TODO: Should: publish on npm before we move this to production, serve via jsdelivr
// TODO: Should: think in more depth what could happen when changing data type with filters, providers, etc. already set
// TODO: Should: reasonable level of customizability
// TODO: Should: docs
// TODO: Could: avoid Moire patterns and waves (perhaps needs downscaling to exact canvas size)
// TODO: Could: various zoom modes (horizontal, vertical, both, none...)
// TODO: Would: try setting `downsamplingPixelsPerRect` dynamically, based on rendering times
// TODO: Would: Smoothen zooming and panning with mouse wheel?



/** Class names of DOM elements */
const Class = {
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
type Provider<TX, TY, TItem, TResult> = (...args: ProviderParams<TX, TY, TItem>) => TResult

/** Emitted on data-item-related events (hover, click...) */
type ItemEventParam<TX, TY, TItem> = {
    datum: TItem,
    x: TX,
    y: TY,
    xIndex: number,
    yIndex: number,
    sourceEvent: MouseEvent,
} | undefined

/** Emitted on zoom event */
type ZoomEventParam<TX, TY, TItem> = {
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

export function DefaultTooltipProvider(dataItem: unknown, x: unknown, y: unknown, xIndex: number, yIndex: number): string {
    return `x index: ${xIndex}<br>y index: ${yIndex}<br>x value: ${x}<br>y value: ${y}<br>item: ${formatDataItem(dataItem)}`;
}

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

    // More config via CSS:
    // .hotmap-canvas-div { background-color: none; }...
};



export class Heatmap<TX, TY, TItem> {
    private originalData: DataDescription<TX, TY, TItem>;
    private data: Data<TItem>;
    private downsampler?: Downsampler<'image'>;
    private xDomain: Domain<TX>;
    private yDomain: Domain<TY>;
    private zoomBehavior?: d3.ZoomBehavior<Element, unknown>;
    private xAlignment: XAlignmentMode = 'center';
    private yAlignment: YAlignmentMode = 'center';

    private colorProvider: Provider<TX, TY, TItem, string | Color> = DefaultColorProvider;
    private tooltipProvider?: Provider<TX, TY, TItem, string> = DefaultTooltipProvider;
    private filter?: Provider<TX, TY, TItem, boolean> = undefined;
    private visualParams: VisualParams = DefaultVisualParams;
    public readonly events = {
        hover: new BehaviorSubject<ItemEventParam<TX, TY, TItem>>(undefined),
        click: new BehaviorSubject<ItemEventParam<TX, TY, TItem>>(undefined),
        zoom: new BehaviorSubject<ZoomEventParam<TX, TY, TItem>>(undefined),
        resize: new BehaviorSubject<Box | undefined>(undefined),
    } as const;
    /** DOM elements managed by this component */
    private dom?: {
        rootDiv: d3.Selection<HTMLDivElement, any, any, any>;
        mainDiv: d3.Selection<HTMLDivElement, any, any, any>;
        canvasDiv: d3.Selection<HTMLDivElement, any, any, any>;
        canvas: d3.Selection<HTMLCanvasElement, any, any, any>;
        svg: d3.Selection<SVGSVGElement, any, any, any>;
    };
    /** Canvas rendering context */
    private ctx?: CanvasRenderingContext2D;
    private boxes: Boxes;
    private scales: Scales;
    /** Approximate width of a rectangle in pixels, when showing downsampled data.
     * (higher value means more responsive but lower-resolution visualization) */
    private downsamplingPixelsPerRect = 4;
    /** Position of the pinned tooltip, if any. In world coordinates, continuous. Use `Math.floor` to get column/row index. */
    private pinnedTooltip?: XY = undefined;
    private readonly lastWheelEvent = { timestamp: 0, absDelta: 0, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };


    /** Create a new `Heatmap` and set `data` */
    static create<TX, TY, TItem>(data: DataDescription<TX, TY, TItem>): Heatmap<TX, TY, TItem>;
    /** Create a new `Heatmap` with dummy data */
    static create(): Heatmap<number, number, number>;
    static create<TX_, TY_, TItem_>(data?: DataDescription<TX_, TY_, TItem_>): Heatmap<TX_, TY_, TItem_> | Heatmap<number, number, number> {
        if (data !== undefined) {
            return new this(data);
        } else {
            // return new this(makeRandomData2(2000, 20));
            return new this(makeRandomData2(2e5, 20));
        }
    }

    private constructor(data: DataDescription<TX, TY, TItem>) {
        this.setData(data);
        if (this.data.isNumeric) {
            const dataRange = Data.getRange(this.data as Data<number>);
            const colorProvider = DefaultNumericColorProviderFactory(dataRange.min, dataRange.max);
            (this as unknown as Heatmap<TX, TY, number>).setColor(colorProvider);
        }
    }


    /** Clear all the contents of the root div. */
    remove(): void {
        if (!this.dom) return;
        this.dom.rootDiv.select('*').remove();
    }

    /** Render this heatmap in the given DIV element */
    render(divElementOrId: HTMLDivElement | string): this {
        if (this.dom) {
            console.error(`This ${this.constructor.name} has already been rendered in element`, this.dom.rootDiv.node());
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
        if (ctx) this.ctx = ctx;
        else throw new Error('Failed to initialize canvas');

        this.boxes = {
            visWorld: Box.create(0, 0, this.data.nColumns, this.data.nRows),
            wholeWorld: Box.create(0, 0, this.data.nColumns, this.data.nRows),
            canvas: Box.create(0, 0, CANVAS_INIT_SIZE.width, CANVAS_INIT_SIZE.height), // To be changed via 'resize' event subscription
        };

        this.events.resize.subscribe(box => {
            if (!box) return;
            this.boxes.canvas = box;
            this.boxes.canvas = box;
            this.scales = Scales(this.boxes);
            if (this.ctx) {
                this.ctx.canvas.width = Box.width(box);
                this.ctx.canvas.height = Box.height(box);
            }
            this.requestDraw();
        });

        const svg = attrd(canvasDiv.append('svg'), {
            style: { position: 'absolute', width: '100%', height: '100%' },
        });
        this.dom = { rootDiv, mainDiv, canvasDiv, canvas, svg };

        for (const eventName in this.handlers) {
            svg.on(eventName, e => this.handlers[eventName as keyof typeof this.handlers](e));
            // wheel event must be subscribed before setting zoom
        }

        this.emitResize();
        d3.select(window).on('resize.resizehotmapcanvas', () => this.emitResize());

        this.addZoomBehavior();
        this.addPinnedTooltipBehavior();

        console.timeEnd('Hotmap render');
        return this;
    }

    private getColorArray(): Image {
        // console.time('get all colors')
        const image = Image.create(this.data.nColumns, this.data.nRows);
        for (let iy = 0; iy < this.data.nRows; iy++) {
            for (let ix = 0; ix < this.data.nColumns; ix++) {
                const item = Data.getItem(this.data, ix, iy);
                if (item === undefined) continue; // keep transparent black
                const color = this.colorProvider(item, this.xDomain.values[ix], this.yDomain.values[iy], ix, iy);
                const c = (typeof color === 'string') ? Color.fromString(color) : color;
                Color.toImage(c, image, ix, iy);
            }
        }
        // console.timeEnd('get all colors')
        return image;
    }

    private emitResize() {
        if (!this.dom) return;
        const size = getSize(this.dom.canvas);
        const box = Box.create(0, 0, size.width, size.height);
        this.events.resize.next(box);
    }

    private setRawData(data: Data<TItem>): this {
        this.data = data;
        this.downsampler = undefined;
        if (this.boxes) {
            const newWholeWorld = Box.create(0, 0, data.nColumns, data.nRows);
            const xScale = Box.width(newWholeWorld) / Box.width(this.boxes.wholeWorld);
            const yScale = Box.height(newWholeWorld) / Box.height(this.boxes.wholeWorld);
            this.boxes.wholeWorld = newWholeWorld;
            this.boxes.visWorld = Box.clamp({
                xmin: this.boxes.visWorld.xmin * xScale,
                xmax: this.boxes.visWorld.xmax * xScale,
                ymin: this.boxes.visWorld.ymin * yScale,
                ymax: this.boxes.visWorld.ymax * yScale
            }, newWholeWorld, MIN_ZOOMED_DATAPOINTS_HARD, MIN_ZOOMED_DATAPOINTS_HARD);
            this.scales = Scales(this.boxes);
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
        self.xDomain = Domain.create(xDomain);
        self.yDomain = Domain.create(yDomain);
        let warnedX = false;
        let warnedY = false;
        for (let i = 0; i < items.length; i++) {
            const d = items[i];
            const x = xs[i];
            const y = ys[i];
            const ix = self.xDomain.index.get(x);
            const iy = self.yDomain.index.get(y);
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
            } else if (self.filter !== undefined && !self.filter(d, x, y, ix, iy)) {
                // skipping this item
            } else {
                array[nColumns * iy + ix] = d;
            }
        }
        const isNumeric = items.every(d => typeof d === 'number') as (TItem_ extends number ? true : false);
        self.originalData = data;
        self.setRawData({ items: array, nRows, nColumns, isNumeric });
        return self;
    }

    /** Change X and Y domain without changing the data (can be used for reordering or hiding columns/rows). */
    setDomains(xDomain: TX[] | undefined, yDomain: TY[] | undefined): this {
        this.setData({
            ...this.originalData,
            xDomain: xDomain ?? this.originalData.xDomain,
            yDomain: yDomain ?? this.originalData.yDomain,
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
        this.colorProvider = colorProvider;
        this.downsampler = undefined;
        this.requestDraw();
        return this;
    }

    setTooltip(tooltipProvider: ((...args: ProviderParams<TX, TY, TItem>) => string) | 'default' | undefined): this {
        if (tooltipProvider === 'default')
            this.tooltipProvider = DefaultTooltipProvider;
        else
            this.tooltipProvider = tooltipProvider;
        return this;
    }

    setFilter(filter: ((...args: ProviderParams<TX, TY, TItem>) => boolean) | undefined): this {
        this.filter = filter;
        this.setData(this.originalData); // reapplies filter
        return this;
    }

    setVisualParams(params: Partial<VisualParams>): this {
        this.visualParams = merge(cloneDeep(this.visualParams), params);
        this.requestDraw();
        return this;
    }

    /** Controls how column/row indices and names map to X and Y axes. */
    setAlignment(x: XAlignmentMode | undefined, y: YAlignmentMode | undefined): this {
        if (x) this.xAlignment = x;
        if (y) this.yAlignment = y;
        this.emitZoom();
        return this;
    }

    private readonly drawer = Refresher(() => this._draw());
    private requestDraw() {
        this.drawer.requestRefresh();
    }

    /** Do not call directly! Call `requestDraw` instead to avoid browser freezing. */
    private _draw() {
        if (!this.dom) return;
        const xResolution = Box.width(this.boxes.canvas) / this.downsamplingPixelsPerRect;
        this.downsampler ??= Downsampler.fromImage(this.getColorArray());
        // console.time('downsample')
        const downsampledImage = Downsampler.getDownsampled(this.downsampler, { x: xResolution * Box.width(this.boxes.wholeWorld) / (Box.width(this.boxes.visWorld)), y: this.data.nRows });
        // console.timeEnd('downsample')
        return this.drawThisImage(downsampledImage, this.data.nColumns / downsampledImage.nColumns, 1);
    }

    private drawTheseData(data: Data<TItem>, xScale: number) {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, Box.width(this.boxes.canvas), Box.height(this.boxes.canvas));
        const width = scaleDistance(this.scales.worldToCanvas.x, 1) * xScale;
        const height = scaleDistance(this.scales.worldToCanvas.y, 1);
        const xHalfGap = xScale === 1 ? 0.5 * this.getXGap(width) : 0;
        const yHalfGap = 0.5 * this.getYGap(height);
        const colFrom = Math.floor(this.boxes.visWorld.xmin / xScale);
        const colTo = Math.ceil(this.boxes.visWorld.xmax / xScale); // exclusive

        for (let iy = 0; iy < data.nRows; iy++) {
            for (let ix = colFrom; ix < colTo; ix++) {
                const item = Data.getItem(data, ix, iy);
                if (item === undefined) continue;
                const color = this.colorProvider(item, this.xDomain.values[ix], this.yDomain.values[iy], ix, iy);
                this.ctx.fillStyle = (typeof color === 'string') ? color : Color.toString(color);
                const x = this.scales.worldToCanvas.x(ix * xScale);
                const y = this.scales.worldToCanvas.y(iy);
                this.ctx.fillRect(x + xHalfGap, y + yHalfGap, width - 2 * xHalfGap, height - 2 * yHalfGap);
            }
        }
    }

    private drawThisImage(image: Image, xScale: number, yScale: number) {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, Box.width(this.boxes.canvas), Box.height(this.boxes.canvas));
        const width = scaleDistance(this.scales.worldToCanvas.x, 1) * xScale;
        const height = scaleDistance(this.scales.worldToCanvas.y, 1);
        const xHalfGap = 0.5 * this.getXGap(width);
        const yHalfGap = 0.5 * this.getYGap(height);
        const opacityRatio =
            (xScale === 1 ? 1 : (1 - this.getXGap(width) / width))
            * (yScale === 1 ? 1 : (1 - this.getYGap(height) / height)); // This compensates omitting gaps by lowering opacity (when scaled)
        const colFrom = Math.floor(this.boxes.visWorld.xmin / xScale);
        const colTo = Math.ceil(this.boxes.visWorld.xmax / xScale); // exclusive
        // console.time(`drawThisImage ${colTo - colFrom} ${image.nRows}`)

        const { nRows, nColumns } = image;
        for (let iy = 0; iy < nRows; iy++) {
            if (iy < 0 || iy >= nRows) continue;
            const y = this.scales.worldToCanvas.y(iy);
            let yFrom = y, yTo = y + height;
            if (yScale === 1) {
                yFrom += yHalfGap;
                yTo -= yHalfGap;
            } else {
                yFrom = Math.floor(yFrom);
                yTo = Math.floor(yTo);
            }
            for (let ix = colFrom; ix < colTo; ix++) {
                if (ix < 0 || ix >= nColumns) continue;
                const x = this.scales.worldToCanvas.x(ix * xScale);
                let xFrom = x, xTo = x + width;
                if (xScale === 1) {
                    xFrom += xHalfGap;
                    xTo -= xHalfGap;
                } else {
                    // This magic is to fight Moire patterns
                    xFrom = Math.floor(xFrom);
                    xTo = Math.floor(xTo);
                }
                let color = Color.fromImage(image, ix, iy);
                if (opacityRatio !== 1) color = Color.scaleAlpha(color, opacityRatio);
                this.ctx.fillStyle = Color.toString(color); // this line is a performance bottleneck, .fillStyle only takes strings :(
                // this.ctx.fillStyle = (ix+iy)%2?'#ff0000':'#cccccc'
                this.ctx.fillRect(xFrom, yFrom, xTo - xFrom, yTo - yFrom);
            }
        }
        // console.timeEnd(`drawThisImage ${colTo - colFrom} ${image.nRows}`)
    }

    /** Return horizontal gap between rectangles, in canvas pixels */
    private getXGap(colWidthOnCanvas: number): number {
        const gap1 = isNil(this.visualParams.xGapPixels) ? undefined : this.visualParams.xGapPixels;
        const gap2 = isNil(this.visualParams.xGapRelative) ? undefined : this.visualParams.xGapRelative * colWidthOnCanvas;
        return clamp(minimum(gap1, gap2) ?? 0, 0, colWidthOnCanvas);
    }
    /** Return vertical gap between rectangles, in canvas pixels */
    private getYGap(rowHeightOnCanvas: number): number {
        const gap1 = isNil(this.visualParams.yGapPixels) ? undefined : this.visualParams.yGapPixels;
        const gap2 = isNil(this.visualParams.yGapRelative) ? undefined : this.visualParams.yGapRelative * rowHeightOnCanvas;
        return clamp(minimum(gap1, gap2) ?? 0, 0, rowHeightOnCanvas);
    }

    private addZoomBehavior() {
        if (!this.dom) return;
        if (this.zoomBehavior) {
            // Remove any old behavior
            this.zoomBehavior.on('zoom', null);
        }
        this.zoomBehavior = d3.zoom();
        this.zoomBehavior.filter(e => (e instanceof WheelEvent) ? (this.wheelAction(e).kind === 'zoom') : true);
        this.zoomBehavior.wheelDelta(e => {
            // Default function is: -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1)
            const action = this.wheelAction(e);
            return action.kind === 'zoom' ? ZOOM_SENSITIVITY * action.delta : 0;
        });
        this.zoomBehavior.on('zoom', e => {
            this.boxes.visWorld = this.zoomTransformToVisWorld(e.transform);
            this.scales = Scales(this.boxes);
            this.handleHover(e.sourceEvent);
            this.emitZoom();
            this.requestDraw();
        });
        this.dom.svg.call(this.zoomBehavior as any);
        // .on('wheel', e => e.preventDefault()); // Prevent fallback to normal scroll when on min/max zoom
        this.events.resize.subscribe(() => this.adjustZoomExtent());
    }
    private adjustZoomExtent() {
        if (!this.zoomBehavior) return;
        this.zoomBehavior.translateExtent([[this.boxes.wholeWorld.xmin, -Infinity], [this.boxes.wholeWorld.xmax, Infinity]]);
        const canvasWidth = Box.width(this.boxes.canvas);
        const wholeWorldWidth = Box.width(this.boxes.wholeWorld);
        const minZoom = canvasWidth / wholeWorldWidth; // zoom-out
        const maxZoom = Math.max(canvasWidth / MIN_ZOOMED_DATAPOINTS, minZoom); // zoom-in
        this.zoomBehavior.scaleExtent([minZoom, maxZoom]);
        this.zoomBehavior.extent([[this.boxes.canvas.xmin, this.boxes.canvas.ymin], [this.boxes.canvas.xmax, this.boxes.canvas.ymax]]);
        const currentZoom = this.visWorldToZoomTransform(this.boxes.visWorld);
        this.zoomBehavior.transform(this.dom?.svg as any, currentZoom);
    }

    private zoomTransformToVisWorld(transform: { k: number, x: number, y: number }): Box {
        return {
            ...this.boxes.visWorld, // preserve Y zoom
            xmin: (this.boxes.canvas.xmin - transform.x) / transform.k,
            xmax: (this.boxes.canvas.xmax - transform.x) / transform.k,
        };
    }

    private visWorldToZoomTransform(visWorld: Box): d3.ZoomTransform {
        const k = (this.boxes.canvas.xmax - this.boxes.canvas.xmin) / (visWorld.xmax - visWorld.xmin);
        const x = this.boxes.canvas.xmin - k * visWorld.xmin;
        const y = 0;
        return new d3.ZoomTransform(k, x, y);
    }

    private zoomParamFromVisWorld(box: Box | undefined): ZoomEventParam<TX, TY, TItem> {
        if (!box) return undefined;

        const xMinIndex_ = round(box.xmin, ZOOM_EVENT_ROUNDING_PRECISION); // This only holds for xAlignment left
        const xMaxIndex_ = round(box.xmax, ZOOM_EVENT_ROUNDING_PRECISION); // This only holds for xAlignment left
        const xFirstVisibleIndex = clamp(Math.floor(xMinIndex_), 0, this.data.nColumns - 1);
        const xLastVisibleIndex = clamp(Math.ceil(xMaxIndex_) - 1, 0, this.data.nColumns - 1);

        const yMinIndex_ = round(box.ymin, ZOOM_EVENT_ROUNDING_PRECISION); // This only holds for yAlignment top
        const yMaxIndex_ = round(box.ymax, ZOOM_EVENT_ROUNDING_PRECISION); // This only holds for yAlignment top
        const yFirstVisibleIndex = clamp(Math.floor(yMinIndex_), 0, this.data.nRows - 1);
        const yLastVisibleIndex = clamp(Math.ceil(yMaxIndex_) - 1, 0, this.data.nRows - 1);

        const xShift = indexAlignmentShift(this.xAlignment);
        const yShift = indexAlignmentShift(this.yAlignment);

        return {
            xMinIndex: xMinIndex_ + xShift,
            xMaxIndex: xMaxIndex_ + xShift,
            xMin: Domain.interpolateValue(this.xDomain, xMinIndex_ + xShift),
            xMax: Domain.interpolateValue(this.xDomain, xMaxIndex_ + xShift),
            xFirstVisibleIndex,
            xLastVisibleIndex,
            xFirstVisible: this.xDomain.values[xFirstVisibleIndex],
            xLastVisible: this.xDomain.values[xLastVisibleIndex],

            yMinIndex: yMinIndex_ + yShift,
            yMaxIndex: yMaxIndex_ + yShift,
            yMin: Domain.interpolateValue(this.yDomain, yMinIndex_ + yShift),
            yMax: Domain.interpolateValue(this.yDomain, yMaxIndex_ + yShift),
            yFirstVisibleIndex,
            yLastVisibleIndex,
            yFirstVisible: this.yDomain.values[yFirstVisibleIndex],
            yLastVisible: this.yDomain.values[yLastVisibleIndex],
        };

    }

    private emitZoom(): void {
        if (this.boxes.visWorld) {
            nextIfChanged(this.events.zoom, this.zoomParamFromVisWorld(this.boxes.visWorld));
        }
    }

    /** Enforce change of zoom and return the zoom value after the change */
    zoom(z: Partial<ZoomEventParam<TX, TY, TItem>> | undefined): ZoomEventParam<TX, TY, TItem> {
        if (!this.dom || !this.zoomBehavior) return undefined;

        const visWorldBox = Box.clamp({
            xmin: this.getZoomRequestIndexMagic('x', 'Min', z) ?? this.boxes.wholeWorld.xmin,
            xmax: this.getZoomRequestIndexMagic('x', 'Max', z) ?? this.boxes.wholeWorld.xmax,
            ymin: this.getZoomRequestIndexMagic('y', 'Min', z) ?? this.boxes.wholeWorld.ymin,
            ymax: this.getZoomRequestIndexMagic('y', 'Max', z) ?? this.boxes.wholeWorld.ymax,
        }, this.boxes.wholeWorld, MIN_ZOOMED_DATAPOINTS_HARD, MIN_ZOOMED_DATAPOINTS_HARD);

        const xScale = Box.width(this.boxes.canvas) / Box.width(visWorldBox);
        const yScale = Box.height(this.boxes.canvas) / Box.height(visWorldBox);

        const transform = d3.zoomIdentity.scale(xScale).translate(-visWorldBox.xmin, 0);
        this.zoomBehavior.transform(this.dom.svg as any, transform);
        return this.zoomParamFromVisWorld(visWorldBox);
    }

    /** Return current zoom */
    getZoom(): ZoomEventParam<TX, TY, TItem> {
        return this.zoomParamFromVisWorld(this.boxes.visWorld);
    }

    private getZoomRequestIndexMagic(axis: 'x' | 'y', end: 'Min' | 'Max', z: Partial<ZoomEventParam<TX, TY, TItem>>): number | undefined {
        if (isNil(z)) return undefined;

        const fl = end === 'Min' ? 'First' : 'Last';
        const index = z[`${axis}${end}Index`];
        const value = z[`${axis}${end}`] as TX | TY | undefined;
        const visIndex = z[`${axis}${fl}VisibleIndex`];
        const visValue = z[`${axis}${fl}Visible`];
        const domain = this[`${axis}Domain`];
        const alignment = this[`${axis}Alignment`];

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
        const xIndex = Math.floor(this.scales.canvasToWorld.x(event.offsetX));
        const yIndex = Math.floor(this.scales.canvasToWorld.y(event.offsetY));
        const datum = Data.getItem(this.data, xIndex, yIndex);
        if (!datum) {
            return undefined;
        }
        const x = this.xDomain.values[xIndex];
        const y = this.yDomain.values[yIndex];
        return { datum, x, y, xIndex, yIndex, sourceEvent: event };
    }

    private handleHover(event: MouseEvent | undefined) {
        const pointed = this.getPointedItem(event);
        nextIfChanged(this.events.hover, pointed, v => ({ ...v, sourceEvent: undefined }));
        this.drawMarkers(pointed);
        this.drawTooltip(pointed);
    }

    private drawMarkers(pointed: ItemEventParam<TX, TY, TItem>) {
        if (!this.dom) return;
        if (pointed) {
            const x = this.scales.worldToCanvas.x(pointed.xIndex);
            const y = this.scales.worldToCanvas.y(pointed.yIndex);
            const width = scaleDistance(this.scales.worldToCanvas.x, 1);
            const height = scaleDistance(this.scales.worldToCanvas.y, 1);
            this.addOrUpdateMarker(Class.Marker, { stroke: 'black', strokeWidth: 4, rx: 1, ry: 1, fill: 'none' }, {
                x, y, width, height
            });
            this.addOrUpdateMarker(Class.MarkerX, { stroke: 'black', strokeWidth: 2, rx: 1, ry: 1, fill: 'none' }, {
                x,
                y: this.boxes.canvas.ymin,
                width,
                height: Box.height(this.boxes.canvas),
            });
            this.addOrUpdateMarker(Class.MarkerY, { stroke: 'black', strokeWidth: 2, rx: 1, ry: 1, fill: 'none' }, {
                x: this.boxes.canvas.xmin,
                y,
                width: Box.width(this.boxes.canvas),
                height,
            });
        } else {
            this.dom.svg.selectAll('.' + Class.Marker).remove();
            this.dom.svg.selectAll('.' + Class.MarkerX).remove();
            this.dom.svg.selectAll('.' + Class.MarkerY).remove();
        }
    }

    private addOrUpdateMarker(className: string, staticAttrs: Parameters<typeof attrd>[1], dynamicAttrs: Parameters<typeof attrd>[1]) {
        if (!this.dom) return;
        const marker = this.dom.svg.selectAll('.' + className).data([1]);
        attrd(marker.enter().append('rect'), { class: className, ...staticAttrs, ...dynamicAttrs });
        attrd(marker, dynamicAttrs);
    }

    private drawTooltip(pointed: ItemEventParam<TX, TY, TItem>) {
        if (!this.dom) return;
        const thisTooltipPinned = pointed && this.pinnedTooltip && pointed.xIndex === Math.floor(this.pinnedTooltip.x) && pointed.yIndex === Math.floor(this.pinnedTooltip.y);
        if (pointed && !thisTooltipPinned && this.tooltipProvider) {
            const tooltipPosition = this.getTooltipPosition(pointed.sourceEvent);
            const tooltipText = this.tooltipProvider(pointed.datum, pointed.x, pointed.y, pointed.xIndex, pointed.yIndex);
            let tooltip = this.dom.canvasDiv.selectAll<HTMLDivElement, any>('.' + Class.TooltipBox);
            if (tooltip.empty()) {
                // Create tooltip if doesn't exist
                tooltip = attrd(this.dom.canvasDiv.append('div'), {
                    class: Class.TooltipBox,
                    style: { position: 'absolute', ...tooltipPosition }
                });
                attrd(tooltip.append('div'), { class: Class.TooltipContent })
                    .html(tooltipText);
            } else {
                // Update tooltip position and content if exists
                attrd(tooltip, { style: tooltipPosition })
                    .select('.' + Class.TooltipContent)
                    .html(tooltipText);
            }
        } else {
            this.dom.canvasDiv.selectAll('.' + Class.TooltipBox).remove();
        }
    }

    private drawPinnedTooltip(pointed: ItemEventParam<TX, TY, TItem>) {
        if (!this.dom) return;
        this.dom.canvasDiv.selectAll('.' + Class.PinnedTooltipBox).remove();
        if (pointed && this.tooltipProvider) {
            this.pinnedTooltip = { x: this.scales.canvasToWorld.x(pointed.sourceEvent.offsetX), y: this.scales.canvasToWorld.y(pointed.sourceEvent.offsetY) };
            const tooltipPosition = this.getTooltipPosition(pointed.sourceEvent);
            const tooltipText = this.tooltipProvider(pointed.datum, pointed.x, pointed.y, pointed.xIndex, pointed.yIndex);

            const tooltip = attrd(this.dom.canvasDiv.append('div'), {
                class: Class.PinnedTooltipBox,
                style: { position: 'absolute', ...tooltipPosition },
            });

            // Tooltip content
            attrd(tooltip.append('div'), { class: Class.PinnedTooltipContent })
                .html(tooltipText);

            // Tooltip close button
            attrd(tooltip.append('div'), { class: Class.PinnedTooltipClose })
                .on('click', () => this.events.click.next(undefined))
                .append('svg')
                .attr('viewBox', '0 0 24 24')
                .attr('preserveAspectRatio', 'none')
                .append('path')
                .attr('d', 'M19,6.41 L17.59,5 L12,10.59 L6.41,5 L5,6.41 L10.59,12 L5,17.59 L6.41,19 L12,13.41 L17.59,19 L19,17.59 L13.41,12 L19,6.41 Z');

            // Tooltip pin
            attrd(tooltip.append('svg'), { class: Class.PinnedTooltipPin })
                .attr('viewBox', '0 0 100 100')
                .attr('preserveAspectRatio', 'none')
                .append('path')
                .attr('d', 'M0,100 L100,40 L60,0 Z');

            // Remove any non-pinned tooltip
            this.drawTooltip(undefined);
        } else {
            this.pinnedTooltip = undefined;
        }
    }

    private addPinnedTooltipBehavior() {
        this.events.click.subscribe(pointed => this.drawPinnedTooltip(pointed));
        const updatePinnedTooltipPosition = () => {
            if (this.dom && this.pinnedTooltip) {
                const domPosition = {
                    offsetX: this.scales.worldToCanvas.x(this.pinnedTooltip.x),
                    offsetY: this.scales.worldToCanvas.y(this.pinnedTooltip.y),
                };
                attrd(this.dom.canvasDiv.selectAll('.' + Class.PinnedTooltipBox), { style: this.getTooltipPosition(domPosition) });
            }
        };
        this.events.zoom.subscribe(updatePinnedTooltipPosition);
        this.events.resize.subscribe(updatePinnedTooltipPosition);
    }

    /** Return tooltip position as CSS style parameters (for position:absolute within this.canvasDiv) for mouse event `e` triggered on this.svg.  */
    private getTooltipPosition(e: MouseEvent | { offsetX: number, offsetY: number }) {
        const left = `${(e.offsetX ?? 0)}px`;
        const bottom = `${Box.height(this.boxes.canvas) - (e.offsetY ?? 0)}px`;
        const display = Box.containsPoint(this.boxes.canvas, { x: e.offsetX, y: e.offsetY }) ? 'unset' : 'none';
        return { left, bottom, display };
    }

    private showScrollingMessage() {
        if (!this.dom) return;
        if (!this.dom.mainDiv.selectAll(`.${Class.Overlay}`).empty()) return;

        const overlay = attrd(this.dom.mainDiv.append('div'), { class: Class.Overlay });
        attrd(overlay.append('div'), { class: Class.OverlayShade });
        attrd(overlay.append('div'), { class: Class.OverlayMessage })
            .text('Press Ctrl and scroll to apply zoom');
        setTimeout(() => overlay.remove(), 750);
    }

    private wheelAction(e: WheelEvent): { kind: 'ignore' } | { kind: 'showHelp' } | { kind: 'zoom', delta: number } | { kind: 'pan', deltaX: number, deltaY: number } {
        const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
        const isVertical = Math.abs(e.deltaX) < Math.abs(e.deltaY);

        const modeSpeed = (e.deltaMode === 1) ? 25 : e.deltaMode ? 500 : 1; // scroll in lines vs pages vs pixels
        const speedup = ZOOM_REQUIRE_CTRL ? 1 : (this.lastWheelEvent.ctrlKey || this.lastWheelEvent.metaKey ? 10 : 1);

        if (isHorizontal) {
            return { kind: 'pan', deltaX: -e.deltaX * modeSpeed * speedup, deltaY: 0 };
        }

        if (isVertical) {
            if (this.lastWheelEvent.shiftKey) {
                return { kind: 'pan', deltaX: -e.deltaY * modeSpeed * speedup, deltaY: 0 };
            }
            if (ZOOM_REQUIRE_CTRL && !this.lastWheelEvent.ctrlKey && !this.lastWheelEvent.metaKey) {
                return (Math.abs(e.deltaY) * modeSpeed >= 5) ? { kind: 'showHelp' } : { kind: 'ignore' };
            }
            return { kind: 'zoom', delta: -e.deltaY * 0.002 * modeSpeed * speedup };
            // Default function for zoom behavior is: -e.deltaY * (e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002) * (e.ctrlKey ? 10 : 1)
        }

        return { kind: 'ignore' };
    }

    private readonly handlers = {
        mousemove: (e: MouseEvent) => this.handleHover(e),
        mouseleave: (e: MouseEvent) => this.handleHover(undefined),
        click: (e: MouseEvent) => this.events.click.next(this.getPointedItem(e)),
        wheel: (e: WheelEvent) => {
            if (!this.dom) return;
            e.preventDefault(); // TODO ???

            // Magic to handle touchpad scrolling on Mac (when user lifts fingers from touchpad, but the browser is still getting wheel events)
            const now = Date.now();
            const absDelta = Math.max(Math.abs(e.deltaX), Math.abs(e.deltaY));
            if (now > this.lastWheelEvent.timestamp + 150 || absDelta > this.lastWheelEvent.absDelta + 1) {
                // Starting a new gesture
                this.lastWheelEvent.ctrlKey = e.ctrlKey;
                this.lastWheelEvent.shiftKey = e.shiftKey;
                this.lastWheelEvent.altKey = e.altKey;
                this.lastWheelEvent.metaKey = e.metaKey;
            }
            this.lastWheelEvent.timestamp = now;
            this.lastWheelEvent.absDelta = absDelta;

            if (this.zoomBehavior) {
                const action = this.wheelAction(e);
                if (action.kind === 'pan') {
                    const shiftX = PAN_SENSITIVITY * scaleDistance(this.scales.canvasToWorld.x, action.deltaX);
                    this.zoomBehavior.duration(1000).translateBy(this.dom.svg as any, shiftX, 0);
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
        xDomain: d3.range(nColumns),
        yDomain: d3.range(nRows),
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
