import { clamp, isNil, range, round } from 'lodash';
import { Color } from './color';
import * as d3 from './d3-modules';
import { Data } from './data';
import { Domain } from './domain';
import { DefaultNumericColorProviderFactory, DrawExtension, DrawExtensionParams, VisualParams } from './extensions/draw';
import { ExtensionInstance, ExtensionInstanceRegistration, HotmapExtension } from './extensions/extension';
import { MarkerExtension } from './extensions/marker';
import { DefaultTooltipExtensionParams, TooltipExtension, TooltipExtensionParams } from './extensions/tooltip';
import { Box, Scales, scaleDistance } from './scales';
import { MIN_ZOOMED_DATAPOINTS_HARD, State } from './state';
import { attrd, getSize, nextIfChanged, removeElement } from './utils';
import { ZoomExtension } from './extensions/zoom';


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


/** Controls how X axis values align with the columns when using `Heatmap.zoom` and `Heatmap.events.zoom` (position of a value on X axis can be aligned to the left edge/center/right edge of the column showing that value) */
export type XAlignmentMode = 'left' | 'center' | 'right'
/** Controls how Y axis values align with the rows when using `Heatmap.zoom` and `Heatmap.events.zoom` (position of a value on Y axis is aligned to the top edge/center/bottom edge of the row showing that value) */
export type YAlignmentMode = 'top' | 'center' | 'bottom'


export class Heatmap<TX, TY, TItem> {
    private readonly state: State<TX, TY, TItem> = new State();

    get events() { return this.state.events; }

    private readonly _behaviors: ExtensionInstance<{}>[] = [];
    registerBehavior<TParams extends {}, TDefaults extends TParams>(behavior: HotmapExtension<TParams, TDefaults>, params?: Partial<TParams>): ExtensionInstanceRegistration<TParams> {
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

    readonly extensions: {
        tooltip?: ExtensionInstanceRegistration<TooltipExtensionParams<TX, TY, TItem>>,
        draw?: ExtensionInstanceRegistration<DrawExtensionParams<TX, TY, TItem>>,
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
        });

        let colorProvider: Provider<TX, TY, TItem, Color> | undefined = undefined;
        if (this.state.data.isNumeric) {
            const dataRange = Data.getRange(this.state.data as Data<number>);
            colorProvider = DefaultNumericColorProviderFactory(dataRange.min, dataRange.max) as Provider<TX, TY, TItem, Color>;
            // (this as unknown as Heatmap<TX, TY, number>).setColor(colorProvider);
        }
        this.registerBehavior(MarkerExtension);
        this.extensions.tooltip = this.registerBehavior(TooltipExtension);
        this.extensions.draw = this.registerBehavior(DrawExtension, { colorProvider });
        this.registerBehavior(ZoomExtension);
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

        const svg = attrd(canvasDiv.append('svg'), {
            style: { position: 'absolute', width: '100%', height: '100%' },
        });
        this.state.dom = { rootDiv, mainDiv, canvasDiv, canvas, svg };

        svg.on('mousemove', (e: MouseEvent) => this.events.hover.next(this.state.getPointedItem(e)));
        svg.on('mouseleave', (e: MouseEvent) => this.events.hover.next(undefined));
        svg.on('click', (e: MouseEvent) => this.events.click.next(this.state.getPointedItem(e)));

        this.events.render.next(undefined);
        this.emitResize();
        d3.select(window).on('resize.resizehotmapcanvas', () => this.emitResize());

        // this.addZoomBehavior();

        console.timeEnd('Hotmap render');
        return this;
    }

    private emitResize() {
        if (!this.state.dom) return;
        const size = getSize(this.state.dom.canvas);
        const box = Box.create(0, 0, size.width, size.height);
        this.events.resize.next(box);
    }

    private setRawData(data: Data<TItem>): this {
        this.state.data = data;
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
            }, newWholeWorld, MIN_ZOOMED_DATAPOINTS_HARD, MIN_ZOOMED_DATAPOINTS_HARD); // TODO factor this out with zoom-related helpers
            this.state.scales = Scales(this.state.boxes);
        }
        // this.adjustZoomExtent();
        this.events.data.next(data);
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
        this.extensions.draw?.update({ colorProvider });
        return this;
    }

    setTooltip(tooltipProvider: ((...args: ProviderParams<TX, TY, TItem>) => string) | 'default' | null): this {
        this.extensions.tooltip?.update({
            tooltipProvider: (tooltipProvider === 'default') ? DefaultTooltipExtensionParams.tooltipProvider : tooltipProvider,
        });
        return this;
    }

    setFilter(filter: ((...args: ProviderParams<TX, TY, TItem>) => boolean) | undefined): this {
        this.state.filter = filter;
        this.setData(this.state.originalData); // reapplies filter
        return this;
    }

    setVisualParams(params: Partial<VisualParams>): this {
        this.extensions.draw?.update(params);
        return this;
    }

    /** Controls how column/row indices and names map to X and Y axes. */
    setAlignment(x: XAlignmentMode | undefined, y: YAlignmentMode | undefined): this {
        if (x) this.state.xAlignment = x;
        if (y) this.state.yAlignment = y;
        this.state.emitZoom();
        return this;
    }

    /** Enforce change of zoom and return the zoom value after the change */
    zoom(z: Partial<ZoomEventParam<TX, TY, TItem>> | undefined): ZoomEventParam<TX, TY, TItem> {
        return this.state.zoom(z);
        // if (!this.state.dom || !this.state.zoomBehavior) return undefined;

        // const visWorldBox = Box.clamp({
        //     xmin: this.getZoomRequestIndexMagic('x', 'Min', z) ?? this.state.boxes.wholeWorld.xmin,
        //     xmax: this.getZoomRequestIndexMagic('x', 'Max', z) ?? this.state.boxes.wholeWorld.xmax,
        //     ymin: this.getZoomRequestIndexMagic('y', 'Min', z) ?? this.state.boxes.wholeWorld.ymin,
        //     ymax: this.getZoomRequestIndexMagic('y', 'Max', z) ?? this.state.boxes.wholeWorld.ymax,
        // }, this.state.boxes.wholeWorld, MIN_ZOOMED_DATAPOINTS_HARD, MIN_ZOOMED_DATAPOINTS_HARD);

        // const xScale = Box.width(this.state.boxes.canvas) / Box.width(visWorldBox);
        // const yScale = Box.height(this.state.boxes.canvas) / Box.height(visWorldBox);

        // const transform = d3.zoomIdentity.scale(xScale).translate(-visWorldBox.xmin, 0);
        // this.state.zoomBehavior.transform(this.state.dom.svg as any, transform);
        // return this.zoomParamFromVisWorld(visWorldBox);
    }

    /** Return current zoom */
    getZoom(): ZoomEventParam<TX, TY, TItem> {
        return this.state.getZoom();
        // return this.zoomParamFromVisWorld(this.state.boxes.visWorld);
    }

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
