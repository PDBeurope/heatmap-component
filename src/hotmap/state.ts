import { clamp, isNil, round } from 'lodash';
import { BehaviorSubject } from 'rxjs';
import * as d3 from './d3-modules';
import { Array2D } from './data/array2d';
import { Domain } from './data/domain';
import { Box, Boxes, Scales } from './scales';
import { getSize, nextIfChanged } from './utils';


/** Avoid zooming to things like 0.4999999999999998 */
const ZOOM_EVENT_ROUNDING_PRECISION = 9;
export const MIN_ZOOMED_DATAPOINTS_HARD = 1;


// TODO move to data submodule?
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
    /** Optional filter function that can be used to show only a subset of data items */
    filter?: Provider<TX, TY, TItem, boolean>,
}
export const DataDescription = {
    /** Return a DataDescription with no data. */
    empty<TX, TY, TItem>(): DataDescription<TX, TY, TItem> {
        return { xDomain: [], yDomain: [], items: [], x: [], y: [] };
    },
};

/** A function that returns something (of type `TResult`) for a data item (such functions are passed to setTooltip, setColor etc.). */
export type Provider<TX, TY, TItem, TResult> = (d: TItem, x: TX, y: TY, xIndex: number, yIndex: number) => TResult

// TODO move to events submodule?
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

    /** Identifies the originator of the zoom event (this is to avoid infinite loop when multiple component listen to zoom and change it) */
    origin?: string,
} | undefined


/** Controls how X axis values align with the columns when using `Heatmap.zoom` and `Heatmap.events.zoom` (position of a value on X axis can be aligned to the left edge/center/right edge of the column showing that value) */
export type XAlignmentMode = 'left' | 'center' | 'right'
/** Controls how Y axis values align with the rows when using `Heatmap.zoom` and `Heatmap.events.zoom` (position of a value on Y axis is aligned to the top edge/center/bottom edge of the row showing that value) */
export type YAlignmentMode = 'top' | 'center' | 'bottom'


export class State<TX, TY, TItem> {
    /** Data as provided to the `setData` method */
    originalData: DataDescription<TX, TY, TItem> = DataDescription.empty();
    /** A 2D array with the data items, for fast access to a specific row and column */
    dataArray: Array2D<TItem> = Array2D.empty();
    /** Values corresponding to the individual columns */
    xDomain: Domain<TX> = Domain.create([]);
    /** Values corresponding to the individual rows */
    yDomain: Domain<TY> = Domain.create([]);
    /** Controls how X axis values align with the columns when using `Heatmap.zoom` and `Heatmap.events.zoom` (position of a value on X axis can be aligned to the left edge/center/right edge of the column showing that value) */
    xAlignment: XAlignmentMode = 'center';
    /** Controls how Y axis values align with the rows when using `Heatmap.zoom` and `Heatmap.events.zoom` (position of a value on Y axis is aligned to the top edge/center/bottom edge of the row showing that value) */
    yAlignment: YAlignmentMode = 'center';

    /** Extent of the data world and canvas */
    boxes: Boxes = { wholeWorld: Box.create(0, 0, 1, 1), visWorld: Box.create(0, 0, 1, 1), canvas: Box.create(0, 0, 1, 1) };
    /** Conversion between the data world and canvas coordinates */
    scales: Scales = Scales(this.boxes);

    /** DOM elements managed by this component */
    dom?: {
        /** Root div in which the whole heatmap component is rendered (passed to the `render` method) */
        rootDiv: d3.Selection<HTMLDivElement, any, any, any>;
        /** Position-relative div covering the whole area of the heatmap component */
        mainDiv: d3.Selection<HTMLDivElement, any, any, any>;
        /** Div covering the canvas area */
        canvasDiv: d3.Selection<HTMLDivElement, any, any, any>;
        /** Canvas element for rendering the data */
        canvas: d3.Selection<HTMLCanvasElement, any, any, any>;
        /** SVG element for handling HTML events and rendering simple things (e.g. markers) */
        svg: d3.Selection<SVGSVGElement, any, any, any>;
    };

    /** Custom events fired by the heatmap component, all are RXJS `BehaviorSubject` */
    readonly events = {
        /** Fires when the user hovers over the component */
        hover: new BehaviorSubject<ItemEventParam<TX, TY, TItem>>(undefined),
        /** Fires when the user selects/deselects a data item (e.g. by clicking on it) */
        click: new BehaviorSubject<ItemEventParam<TX, TY, TItem>>(undefined),
        /** Fires when the component is zoomed in or out, or panned (translated) */
        zoom: new BehaviorSubject<ZoomEventParam<TX, TY, TItem>>(undefined),
        /** Fires when the window is resized */
        resize: new BehaviorSubject<Box | undefined>(undefined),
        /** Fires when the visualized data change (including filter or domain change) */
        data: new BehaviorSubject<Array2D<TItem> | undefined>(undefined),
        /** Fires when the component is initially render in a div */
        render: new BehaviorSubject<undefined>(undefined),
    } as const;


    constructor(data: DataDescription<TX, TY, TItem>) {
        this.setData(data);
    }

    setData<TX_, TY_, TItem_>(data: DataDescription<TX_, TY_, TItem_>): State<TX_, TY_, TItem_> {
        const self = this as unknown as State<TX_, TY_, TItem_>;
        const { items, x, y, xDomain, yDomain, filter } = data;
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
            } else if (filter !== undefined && !filter(d, x, y, ix, iy)) {
                // skipping this item
            } else {
                array[nColumns * iy + ix] = d;
            }
        }
        const isNumeric = items.every(d => typeof d === 'number') as (TItem_ extends number ? true : false);
        self.originalData = data;
        self.setDataArray({ items: array, nRows, nColumns, isNumeric });
        return self;
    }

    private setDataArray(data: Array2D<TItem>): void {
        this.dataArray = data;
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
        this.events.data.next(data);
    }


    /** Return data item that is being pointed by the mouse in `event` */
    getPointedItem(event: MouseEvent | undefined): ItemEventParam<TX, TY, TItem> {
        if (!event) {
            return undefined;
        }
        const xIndex = Math.floor(this.scales.canvasToWorld.x(event.offsetX));
        const yIndex = Math.floor(this.scales.canvasToWorld.y(event.offsetY));
        const datum = Array2D.getItem(this.dataArray, xIndex, yIndex);
        if (!datum) {
            return undefined;
        }
        const x = this.xDomain.values[xIndex];
        const y = this.yDomain.values[yIndex];
        return { datum, x, y, xIndex, yIndex, sourceEvent: event };
    }

    emitResize(): void {
        if (!this.dom) return;
        const size = getSize(this.dom.canvas);
        const box = Box.create(0, 0, size.width, size.height);
        this.events.resize.next(box);
    }

    emitZoom(origin?: string): void {
        if (this.boxes.visWorld) {
            nextIfChanged(this.events.zoom, this.zoomParamFromVisWorld(this.boxes.visWorld, origin));
        }
    }

    /** Controls how column/row indices and names map to X and Y axes. */
    setAlignment(x: XAlignmentMode | undefined, y: YAlignmentMode | undefined): void {
        if (x) this.xAlignment = x;
        if (y) this.yAlignment = y;
        this.emitZoom('setAlignment');
    }

    private zoomParamFromVisWorld(box: Box | undefined, origin?: string): ZoomEventParam<TX, TY, TItem> {
        if (!box) return undefined;

        const xMinIndex_ = round(box.xmin, ZOOM_EVENT_ROUNDING_PRECISION); // This only holds for xAlignment left
        const xMaxIndex_ = round(box.xmax, ZOOM_EVENT_ROUNDING_PRECISION); // This only holds for xAlignment left
        const xFirstVisibleIndex = clamp(Math.floor(xMinIndex_), 0, this.dataArray.nColumns - 1);
        const xLastVisibleIndex = clamp(Math.ceil(xMaxIndex_) - 1, 0, this.dataArray.nColumns - 1);

        const yMinIndex_ = round(box.ymin, ZOOM_EVENT_ROUNDING_PRECISION); // This only holds for yAlignment top
        const yMaxIndex_ = round(box.ymax, ZOOM_EVENT_ROUNDING_PRECISION); // This only holds for yAlignment top
        const yFirstVisibleIndex = clamp(Math.floor(yMinIndex_), 0, this.dataArray.nRows - 1);
        const yLastVisibleIndex = clamp(Math.ceil(yMaxIndex_) - 1, 0, this.dataArray.nRows - 1);

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

            origin: origin,
        };

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

    // TODO use origin from the ZoomEventParam, drop `origin` parameter (everywhere)
    /** Enforce change of zoom and return the zoom value after the change */
    zoom(z: Partial<ZoomEventParam<TX, TY, TItem>> | undefined, origin?: string): ZoomEventParam<TX, TY, TItem> {
        const visWorldBox = Box.clamp({
            xmin: this.getZoomRequestIndexMagic('x', 'Min', z) ?? this.boxes.wholeWorld.xmin,
            xmax: this.getZoomRequestIndexMagic('x', 'Max', z) ?? this.boxes.wholeWorld.xmax,
            ymin: this.getZoomRequestIndexMagic('y', 'Min', z) ?? this.boxes.wholeWorld.ymin,
            ymax: this.getZoomRequestIndexMagic('y', 'Max', z) ?? this.boxes.wholeWorld.ymax,
        }, this.boxes.wholeWorld, MIN_ZOOMED_DATAPOINTS_HARD, MIN_ZOOMED_DATAPOINTS_HARD);

        this.zoomVisWorldBox(visWorldBox, origin);
        return this.zoomParamFromVisWorld(visWorldBox, origin);
    }

    zoomVisWorldBox(visWorldBox: Box, origin?: string): void {
        this.boxes.visWorld = visWorldBox;
        this.scales = Scales(this.boxes);
        this.emitZoom(origin);
    }

    /** Return current zoom */
    getZoom(): ZoomEventParam<TX, TY, TItem> {
        return this.zoomParamFromVisWorld(this.boxes.visWorld, undefined);
    }

}


function indexAlignmentShift(alignment: XAlignmentMode | YAlignmentMode) {
    if (alignment === 'left' || alignment === 'top') return 0;
    if (alignment === 'center') return -0.5;
    return -1;
}
