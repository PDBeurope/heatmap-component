import * as d3 from 'd3';
import { clamp, cloneDeep, isNil, merge, round } from 'lodash';
import { BehaviorSubject } from 'rxjs';
import { Data, Downsampling, getDataItem, makeRandomRawData } from './data';
import { Domain } from './domain';
import { Box, BoxSize, Boxes, Scales, scaleDistance } from './scales';
import { attrd, getSize, minimum, nextIfChanged } from './utils';


// TODO: pinnable tooltip with "close" button (behaves the same as clicking nothing / zooming / panning)
// TODO: style via CSS file, avoid inline styles
// TODO: use OrRd color scale automatically when data are numeric?
// TODO: think in more depth what could happen when changing data type with filters, providers, etc. already set
// TODO: downsample color instead of value


const AppName = 'hotmap';
const Class = {
    MainDiv: `${AppName}-main-div`,
    CanvasDiv: `${AppName}-canvas-div`,
    Marker: `${AppName}-marker`,
    Tooltip: `${AppName}-tooltip`,
    Overlay: `${AppName}-overlay`,
};
const MIN_ZOOMED_DATAPOINTS = 1;
const MIN_ZOOMED_DATAPOINTS_HARD = 1;

/** Avoid zooming to things like 0.4999999999999998 */
const ZOOM_EVENT_ROUNDING_PRECISION = 9;


export type DataDescription<TX, TY, TItem> = {
    xDomain: TX[],
    yDomain: TY[],
    /** Data items to show in the heatmap (each item is visualized as a rectangle) */
    items: TItem[],
    /** X values for the data items (either an array with the X values (must have the same length as `items`), or a function that computes X value for given item)  */
    x: ((dataItem: TItem, index: number) => TX) | TX[],
    /** Y values for the data items (either an array with the Y values (must have the same length as `items`), or a function that computes X value for given item)  */
    y: ((dataItem: TItem, index: number) => TY) | TY[],
}

/** Types of input parameters of provider functions (that are passed to setTooltip etc.) */
type ProviderParams<TX, TY, TItem> = [d: TItem, x: TX, y: TY, xIndex: number, yIndex: number]

type Provider<TX, TY, TItem, TResult> = (...args: ProviderParams<TX, TY, TItem>) => TResult

type ItemEventParam<TX, TY, TItem> = {
    datum: TItem,
    x: TX,
    y: TY,
    xIndex: number,
    yIndex: number,
    sourceEvent: MouseEvent,
} | undefined

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


export const DefaultColorProvider = () => '#888888';
export const DefaultNumericColorProvider = d3.scaleSequential(d3.interpolateOrRd);
// const DefaultColorScale = d3.scaleLinear([0, 0.5, 1], ['#2222dd', '#ffffff', '#dd2222']);

export function DefaultTooltipProvider(dataItem: unknown, x: unknown, y: unknown, xIndex: number, yIndex: number): string {
    return `x index: ${xIndex}<br>y index: ${yIndex}<br>x value: ${x}<br>y value: ${y}<br>item: ${formatDataItem(dataItem)}`;
}

type XAlignment = 'left' | 'center' | 'right'
type YAlignment = 'top' | 'center' | 'bottom'

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
    // .hotmap-canvas-div { background-color: none; }
};



export class Heatmap<TX, TY, TItem> {
    private originalData: DataDescription<TX, TY, TItem>;
    private data: Data<TItem>;
    private downsampling: TItem extends number ? Downsampling<TItem> : undefined;
    private xDomain: Domain<TX>;
    private yDomain: Domain<TY>;
    private zoomBehavior?: d3.ZoomBehavior<Element, unknown>;
    private xAlignment: XAlignment = 'center';
    private yAlignment: YAlignment = 'center';

    private colorProvider: Provider<TX, TY, TItem, string> = DefaultColorProvider;
    private tooltipProvider?: Provider<TX, TY, TItem, string> = DefaultTooltipProvider;
    private filter?: Provider<TX, TY, TItem, boolean> = undefined;
    private visualParams: VisualParams = DefaultVisualParams;
    public readonly events = {
        hover: new BehaviorSubject<ItemEventParam<TX, TY, TItem>>(undefined),
        click: new BehaviorSubject<ItemEventParam<TX, TY, TItem>>(undefined),
        zoom: new BehaviorSubject<ZoomEventParam<TX, TY, TItem>>(undefined),
        resize: new BehaviorSubject<Box | undefined>(undefined),
    } as const;

    private rootDiv: d3.Selection<HTMLDivElement, any, any, any>;
    private mainDiv: d3.Selection<HTMLDivElement, any, any, any>;
    private canvas: d3.Selection<HTMLCanvasElement, any, any, any>;
    private svg: d3.Selection<SVGSVGElement, any, any, any>;
    private readonly canvasInnerSize: BoxSize = { width: window.screen.width, height: window.screen.height }; // setting canvas size to screen size to avoid upscaling at any window size
    private ctx: CanvasRenderingContext2D;
    private boxes: Boxes;
    private scales: Scales;
    /** Approximate width of a rectangle in pixels, when showing downsampled data.
     * (higher value means more responsive but shittier visualization)
     * TODO try setting this dynamically, based on rendering times */
    private downsamplingPixelsPerRect = 4;


    static create(): Heatmap<number, number, number>
    static create<TX_, TY_, TItem_>(data: DataDescription<TX_, TY_, TItem_>): Heatmap<TX_, TY_, TItem_>
    static create<TX_, TY_, TItem_>(data?: DataDescription<TX_, TY_, TItem_>): Heatmap<TX_, TY_, TItem_> | Heatmap<number, number, number> {
        if (data !== undefined) {
            return new this(data);
        } else {
            return new this(makeRandomData(200, 20));
        }
    }

    private constructor(data: DataDescription<TX, TY, TItem>) {
        this.setData(data);
        if (this.data.isNumeric) {
            (this as unknown as Heatmap<TX, TY, number>).setColor(DefaultNumericColorProvider);
        }
    }

    /** Clear all the contents of the root div. */
    remove(): void {
        if (!this.rootDiv) return;
        this.rootDiv.select('*').remove();
    }

    /** Render this heatmap in the given DIV element */
    render(divElementOrId: HTMLDivElement | string): this {
        if (this.rootDiv) {
            console.error(`This ${this.constructor.name} has already been rendered in element`, this.rootDiv.node());
            throw new Error(`This ${this.constructor.name} has already been rendered. Cannot render again.`);
        }
        console.time('Hotmap render');

        this.rootDiv = (typeof divElementOrId === 'string') ? d3.select(`#${divElementOrId}`) : d3.select(divElementOrId);
        if (this.rootDiv.empty()) throw new Error('Failed to initialize, wrong div ID?');
        this.remove();

        this.mainDiv = attrd(this.rootDiv.append('div'), {
            class: Class.MainDiv,
            style: { position: 'relative', width: '100%', height: '100%' },
        });

        const canvasDiv = attrd(this.mainDiv.append('div'), {
            class: Class.CanvasDiv,
            style: {
                position: 'absolute',
                left: '0px', right: '0px', top: '0px', bottom: '0px',
            },
        });

        this.canvas = attrd(canvasDiv.append('canvas'), {
            width: this.canvasInnerSize.width,
            height: this.canvasInnerSize.height,
            style: { position: 'absolute', width: '100%', height: '100%' },
        });

        const ctx = this.canvas.node()?.getContext('2d');
        if (ctx) this.ctx = ctx;
        else throw new Error('Failed to initialize canvas');

        this.boxes = {
            visWorld: Box.create(0, 0, this.data.nColumns, this.data.nRows),
            wholeWorld: Box.create(0, 0, this.data.nColumns, this.data.nRows),
            dom: Box.create(0, 0, 1, 1), // To be changed via 'resize' event subscription
            canvas: Box.create(0, 0, this.canvasInnerSize.width, this.canvasInnerSize.height),
        };

        this.events.resize.subscribe(box => {
            if (!box) return;
            this.boxes.dom = box;
            this.scales = Scales(this.boxes);
            this.draw();
        });

        this.svg = attrd(canvasDiv.append('svg'), {
            style: { position: 'absolute', width: '100%', height: '100%' },
        });

        for (const eventName in this.handlers) {
            this.svg.on(eventName, e => this.handlers[eventName as keyof typeof this.handlers](e));
            // wheel event must be subscribed before setting zoom
        }

        this.emitResize();
        d3.select(window).on('resize.resizehotmapcanvas', () => this.emitResize());

        this.addZoomBehavior();

        console.timeEnd('Hotmap render');
        return this;
    }
    private emitResize() {
        if (!this.canvas) return;
        const size = getSize(this.canvas);
        const box = Box.create(0, 0, size.width, size.height);
        this.events.resize.next(box);
    }

    private setRawData(data: Data<TItem>): this {
        this.data = data;
        if (typeof data.items[0] === 'number') {
            (this as unknown as Heatmap<any, any, number>).downsampling = Downsampling.create(data as Data<number>);
        } else {
            (this as Heatmap<any, any, Exclude<any, number>>).downsampling = undefined;
        }
        // TODO update world and visWorld
        this.draw();
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
        let warned = false;
        for (let i = 0; i < items.length; i++) {
            const d = items[i];
            const x = xs[i];
            const y = ys[i];
            const ix = self.xDomain.index.get(x);
            const iy = self.yDomain.index.get(y);
            if (ix === undefined) {
                if (!warned) {
                    console.warn('Some data items map to X values out of the X domain.'); // TODO add details
                    warned = true;
                }
            } else if (iy === undefined) {
                if (!warned) {
                    console.warn('Some data items map to Y values out of the Y domain.'); // TODO add details
                    warned = true;
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
    setColor(colorProvider: (...args: ProviderParams<TX, TY, TItem>) => string): this {
        this.colorProvider = colorProvider;
        this.draw();
        return this;
    }
    setTooltip(tooltipProvider: ((...args: ProviderParams<TX, TY, TItem>) => string) | 'default' | 'none'): this {
        if (tooltipProvider === 'default')
            this.tooltipProvider = DefaultTooltipProvider;
        else if (tooltipProvider === 'none')
            this.tooltipProvider = undefined;
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
        this.draw();
        return this;
    }
    /** Controls how column/row indices and names map to X and Y axes. */
    setAlignment(x: XAlignment | undefined, y: YAlignment | undefined): this {
        if (x) this.xAlignment = x;
        if (y) this.yAlignment = y;
        this.emitZoom();
        return this;
    }

    private getDataItem(x: number, y: number): TItem | undefined {
        return getDataItem(this.data, x, y);
    }
    private draw() {
        if (!this.rootDiv) return;
        const xResolution = Box.width(this.boxes.dom) / this.downsamplingPixelsPerRect;
        const colFrom = Math.floor(this.boxes.visWorld.xmin);
        const colTo = Math.ceil(this.boxes.visWorld.xmax); // exclusive
        const downsamplingCoefficient = Downsampling.downsamplingCoefficient(colTo - colFrom, xResolution);
        if (this.downsampling && !this.filter) {
            return this.drawTheseData(Downsampling.getDownsampled(this.downsampling, downsamplingCoefficient), downsamplingCoefficient);
        } else {
            return this.drawTheseData(this.data, 1);
        }
    }
    private drawTheseData(data: Data<TItem>, scale: number) {
        if (!this.rootDiv) return;
        // this.ctx.resetTransform(); this.ctx.scale(scale, 1);
        this.ctx.clearRect(0, 0, this.canvasInnerSize.width, this.canvasInnerSize.height);
        const width = scaleDistance(this.scales.worldToCanvas.x, 1) * scale;
        const height = scaleDistance(this.scales.worldToCanvas.y, 1);
        const xHalfGap = scale === 1 ? 0.5 * this.getXGap(width) : 0;
        const yHalfGap = 0.5 * this.getYGap(height);
        const colFrom = Math.floor(this.boxes.visWorld.xmin / scale);
        const colTo = Math.ceil(this.boxes.visWorld.xmax / scale); // exclusive

        for (let iy = 0; iy < data.nRows; iy++) {
            for (let ix = colFrom; ix < colTo; ix++) {
                const item = getDataItem(data, ix, iy);
                if (item === undefined) continue;
                this.ctx.fillStyle = this.colorProvider(item, this.xDomain.values[ix], this.yDomain.values[iy], ix, iy);
                const x = this.scales.worldToCanvas.x(ix * scale);
                const y = this.scales.worldToCanvas.y(iy);
                this.ctx.fillRect(x + xHalfGap, y + yHalfGap, width - 2 * xHalfGap, height - 2 * yHalfGap);
            }
        }
    }
    private getXGap(colWidthOnCanvas: number): number {
        const gap1 = isNil(this.visualParams.xGapPixels) ? undefined : scaleDistance(this.scales.domToCanvas.x, this.visualParams.xGapPixels);
        const gap2 = isNil(this.visualParams.xGapRelative) ? undefined : this.visualParams.xGapRelative * colWidthOnCanvas;
        return clamp(minimum(gap1, gap2) ?? 0, 0, colWidthOnCanvas);
    }
    private getYGap(rowHeightOnCanvas: number): number {
        const gap1 = isNil(this.visualParams.yGapPixels) ? undefined : scaleDistance(this.scales.domToCanvas.y, this.visualParams.yGapPixels);
        const gap2 = isNil(this.visualParams.yGapRelative) ? undefined : this.visualParams.yGapRelative * rowHeightOnCanvas;
        return clamp(minimum(gap1, gap2) ?? 0, 0, rowHeightOnCanvas);
    }

    private addZoomBehavior() {
        if (this.zoomBehavior) {
            // Remove any old behavior
            this.zoomBehavior.on('zoom', null);
        }
        this.zoomBehavior = d3.zoom();
        this.zoomBehavior.filter(e => {
            if (e instanceof WheelEvent) {
                return e.ctrlKey && !e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX);
            } else {
                return true;
            }
        });
        this.zoomBehavior.on('zoom', e => {
            this.boxes.visWorld = this.zoomTransformToVisWorld(e.transform);
            this.scales = Scales(this.boxes);
            this.handleHover(e.sourceEvent);
            this.emitZoom();
            this.draw();
        });
        this.svg.call(this.zoomBehavior as any);
        // .on('wheel', e => e.preventDefault()); // Prevent fallback to normal scroll when on min/max zoom
        this.zoomBehavior.translateExtent([[this.boxes.wholeWorld.xmin, -Infinity], [this.boxes.wholeWorld.xmax, Infinity]]);
        this.events.resize.subscribe(box => {
            if (!this.zoomBehavior) return;
            const domWidth = Box.width(this.boxes.dom);
            const wholeWorldWidth = Box.width(this.boxes.wholeWorld);
            const minZoom = domWidth / wholeWorldWidth; // zoom-out
            const maxZoom = Math.max(domWidth / MIN_ZOOMED_DATAPOINTS, minZoom); // zoom-in
            this.zoomBehavior.scaleExtent([minZoom, maxZoom]);
            this.zoomBehavior.extent([[this.boxes.dom.xmin, this.boxes.dom.ymin], [this.boxes.dom.xmax, this.boxes.dom.ymax]]);
            const currentZoom = this.visWorldToZoomTransform(this.boxes.visWorld);
            this.zoomBehavior.transform(this.svg as any, currentZoom);
        });
    }
    private zoomTransformToVisWorld(transform: { k: number, x: number, y: number }): Box {
        return {
            ...this.boxes.visWorld, // preserve Y zoom
            xmin: (this.boxes.dom.xmin - transform.x) / transform.k,
            xmax: (this.boxes.dom.xmax - transform.x) / transform.k,
        };
    }
    private visWorldToZoomTransform(visWorld: Box): d3.ZoomTransform {
        const k = (this.boxes.dom.xmax - this.boxes.dom.xmin) / (visWorld.xmax - visWorld.xmin);
        const x = this.boxes.dom.xmin - k * visWorld.xmin;
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
    zoom(z: Partial<ZoomEventParam<TX, TY, TItem>> | undefined): ZoomEventParam<TX, TY, TItem> {
        if (!this.zoomBehavior) return undefined;

        const xmin = clamp(this.getZoomRequestIndexMagic('x', 'Min', z) ?? this.boxes.wholeWorld.xmin, this.boxes.wholeWorld.xmin, this.boxes.wholeWorld.xmax - MIN_ZOOMED_DATAPOINTS_HARD);
        const xmax = clamp(this.getZoomRequestIndexMagic('x', 'Max', z) ?? this.boxes.wholeWorld.xmax, xmin + MIN_ZOOMED_DATAPOINTS_HARD, this.boxes.wholeWorld.xmax);
        const ymin = clamp(this.getZoomRequestIndexMagic('y', 'Min', z) ?? this.boxes.wholeWorld.ymin, this.boxes.wholeWorld.ymin, this.boxes.wholeWorld.ymax - MIN_ZOOMED_DATAPOINTS_HARD);
        const ymax = clamp(this.getZoomRequestIndexMagic('y', 'Max', z) ?? this.boxes.wholeWorld.ymax, ymin + MIN_ZOOMED_DATAPOINTS_HARD, this.boxes.wholeWorld.ymax);
        const visWorldBox = Box.create(xmin, ymin, xmax, ymax);

        const xScale = Box.width(this.boxes.dom) / Box.width(visWorldBox);
        const yScale = Box.height(this.boxes.dom) / Box.height(visWorldBox);

        const transform = d3.zoomIdentity.scale(xScale).translate(-xmin, 0);
        this.zoomBehavior.transform(this.svg as any, transform);
        return this.zoomParamFromVisWorld(visWorldBox);
    }
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
        const xIndex = Math.floor(this.scales.domToWorld.x(event.offsetX));
        const yIndex = Math.floor(this.scales.domToWorld.y(event.offsetY));
        const datum = this.getDataItem(xIndex, yIndex);
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

        if (!event || !pointed) {
            // on mouseleave or when cursor is not at any data point
            this.svg.selectAll('.' + Class.Marker).remove();
            this.mainDiv.selectAll('.' + Class.Tooltip).remove();
            return;
        }

        const marker = this.svg.selectAll('.' + Class.Marker).data([1]);
        const variableAttrs = {
            width: scaleDistance(this.scales.worldToDom.x, 1),
            height: scaleDistance(this.scales.worldToDom.y, 1),
            x: this.scales.worldToDom.x(pointed.xIndex),
            y: this.scales.worldToDom.y(pointed.yIndex),
        };
        attrd(marker.enter().append('rect'), {
            class: Class.Marker,
            stroke: 'black',
            strokeWidth: 3,
            rx: 1,
            ry: 1,
            fill: 'none',
            ...variableAttrs,
        });
        attrd(marker, variableAttrs);

        if (this.tooltipProvider) {
            const tooltip = this.mainDiv.selectAll('.' + Class.Tooltip).data([1]);
            const tooltipLeft = `${(event.clientX ?? 0) + 5}px`;
            const tooltipBottom = `${document.documentElement.clientHeight - (event.clientY ?? 0) + 5}px`;
            const tooltipText = this.tooltipProvider(pointed.datum, pointed.x, pointed.y, pointed.xIndex, pointed.yIndex);
            attrd(tooltip.enter().append('div'), {
                class: Class.Tooltip,
                style: {
                    position: 'fixed', left: tooltipLeft, bottom: tooltipBottom,
                    backgroundColor: 'white', border: 'solid black 1px', paddingBlock: '0.25em', paddingInline: '0.5em',
                },
            }).html(tooltipText);
            attrd(tooltip, {
                style: { left: tooltipLeft, bottom: tooltipBottom },
            }).html(tooltipText);
        }
    }

    private showScrollingMessage() {
        if (!this.mainDiv.selectAll(`.${Class.Overlay}`).empty()) return;

        const overlay = attrd(this.mainDiv.append('div'), {
            class: Class.Overlay,
            style: { position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 0 },
        });
        attrd(overlay.append('div'), {
            style: { position: 'absolute', width: '100%', height: '100%', backgroundColor: '#cccccc', opacity: 0.8, zIndex: -1 },
        });
        attrd(overlay.append('div'), {
            style: { paddingInline: '2em', textAlign: 'center', fontSize: '150%', fontWeight: 'bold' },
        }).text('Press Ctrl and scroll to apply zoom');
        setTimeout(() => overlay.remove(), 750);
    }

    private readonly handlers = {
        mousemove: (e: MouseEvent) => this.handleHover(e),
        mouseleave: (e: MouseEvent) => this.handleHover(undefined),
        click: (e: MouseEvent) => this.events.click.next(this.getPointedItem(e)),
        wheel: (e: WheelEvent) => {
            e.preventDefault();
            // Interpret horizontal scroll (and vertical with Shift key) as panning
            if (!this.zoomBehavior) return;
            const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
            const isVertical = Math.abs(e.deltaX) < Math.abs(e.deltaY);
            // ignoring cases when Math.abs(e.deltaX) === Math.abs(e.deltaY)
            const translation = isHorizontal ? e.deltaX : (e.shiftKey && isVertical) ? e.deltaY : 0;
            if (translation !== 0) {
                const shift = scaleDistance(this.scales.domToWorld.x, -translation);
                this.zoomBehavior.translateBy(this.svg as any, shift, 0);
            } else if (isVertical && !e.ctrlKey && Math.abs(e.deltaY) >= 10) {
                this.showScrollingMessage();
            }
            // TODO: relatively scale events from touchpad and wheel
            // TODO: use e.shiftKey and e.ctrlKey from the beginning of the gesture
        },
    } satisfies Record<string, (e: any) => any>;
}


function makeRandomData(nColumns: number, nRows: number): DataDescription<number, number, number> {
    const raw = makeRandomRawData(nColumns, nRows);
    return {
        items: raw.items as number[],
        x: (d, i) => i % nColumns,
        y: (d, i) => Math.floor(i / nColumns),
        xDomain: d3.range(nColumns),
        yDomain: d3.range(nRows),
    };
}

export function formatDataItem(item: any): string {
    if (typeof item === 'number') return item.toFixed(3);
    else return JSON.stringify(item);
}

function indexAlignmentShift(alignment: XAlignment | YAlignment) {
    if (alignment === 'left' || alignment === 'top') return 0;
    if (alignment === 'center') return -0.5;
    return -1;
}
