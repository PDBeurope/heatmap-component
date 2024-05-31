import { clamp, isEqual, isNil, round } from 'lodash';
import { BehaviorSubject } from 'rxjs';
import * as d3 from './d3-modules';
import { Array2D } from './data/array2d';
import { DataDescription } from './data/data-description';
import { Domain } from './data/domain';
import { Box, BoxSize, Boxes, Scales } from './scales';
import { getSize } from './utils';


/** Avoid zooming to things like 0.4999999999999998 */
const ZOOM_EVENT_ROUNDING_PRECISION = 9;

/** Minimum zoomable width/height measured as number of columns/rows */
export const MIN_ZOOMED_DATAPOINTS_HARD = 1;


/** Emitted on data-cell-related events (hover, select...) */
export interface CellEventValue<TX, TY, TDatum> {
    /** Pointed cell (can have a datum in it or can be empty) */
    cell: {
        /** Datum stored in the data cell, unless this is empty cell */
        datum?: TDatum,
        /** X value ("column name") */
        x: TX,
        /** Y value ("row name") */
        y: TY,
        /** Column index */
        xIndex: number,
        /** Row index */
        yIndex: number,
    } | undefined,
    /** Original mouse event that triggered this */
    sourceEvent: MouseEvent | undefined,
}

/** Emitted on zoom event */
export interface ZoomEventValue<TX, TY> {
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
}


/** Controls how X axis values align with the columns when using `Heatmap.zoom` and `Heatmap.events.zoom` (position of a value on X axis can be aligned to the left edge/center/right edge of the column showing that value) */
export type XAlignmentMode = 'left' | 'center' | 'right'
/** Controls how Y axis values align with the rows when using `Heatmap.zoom` and `Heatmap.events.zoom` (position of a value on Y axis is aligned to the top edge/center/bottom edge of the row showing that value) */
export type YAlignmentMode = 'top' | 'center' | 'bottom'


/** Encapsulates the state of a heatmap instance.
 * Shared between the heatmap instance and all registered behaviors.
 * Also provides methods for manipulating the state
 * and takes care of emitting events related to state changes. */
export class State<TX, TY, TDatum> {
    /** Data as provided to the `setData` method */
    originalData: DataDescription<TX, TY, TDatum> = DataDescription.empty();
    /** 2D array with the data values, for fast access to a specific row and column */
    dataArray: Array2D<TDatum | undefined> = Array2D.empty();
    /** Values corresponding to the individual columns ("column names") */
    xDomain: Domain<TX> = Domain.create([]);
    /** Values corresponding to the individual rows ("row names") */
    yDomain: Domain<TY> = Domain.create([]);

    /** Controls how X axis values align with the columns when using `Heatmap.zoom` and `Heatmap.events.zoom` (position of a value on X axis can be aligned to the left edge/center/right edge of the column showing that value). Call `setAlignment` to change. */
    get xAlignment() { return this._xAlignment; }
    private _xAlignment: XAlignmentMode = 'left';
    /** Controls how Y axis values align with the rows when using `Heatmap.zoom` and `Heatmap.events.zoom` (position of a value on Y axis is aligned to the top edge/center/bottom edge of the row showing that value). Call `setAlignment` to change. */
    get yAlignment() { return this._yAlignment; }
    private _yAlignment: YAlignmentMode = 'top';

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

    /** Custom events fired by the heatmap component, all are RxJS `BehaviorSubject` */
    readonly events = {
        /** Fires when the user hovers over the component */
        hover: new BehaviorSubject<CellEventValue<TX, TY, TDatum>>({ cell: undefined, sourceEvent: undefined }),
        /** Fires when the user selects/deselects a cell (e.g. by clicking on it) */
        select: new BehaviorSubject<CellEventValue<TX, TY, TDatum>>({ cell: undefined, sourceEvent: undefined }),
        /** Fires when the component is zoomed in or out, or panned (translated) */
        zoom: new BehaviorSubject<ZoomEventValue<TX, TY> | undefined>(undefined),
        /** Fires when the window is resized. Subject value is the size of the canvas in pixels. */
        resize: new BehaviorSubject<BoxSize | undefined>(undefined),
        /** Fires when the visualized data change (including filter or domain change) */
        data: new BehaviorSubject<undefined>(undefined),
        /** Fires when the component is initially rendered in a div */
        render: new BehaviorSubject<undefined>(undefined),
    } as const;


    constructor(dataDescription: DataDescription<TX, TY, TDatum>) {
        this.setData(dataDescription);
    }

    /** Replace current data by new data.
     * (If the new data are of different type, this method effectively changes the generic type parameters of `this`!
     * Returns re-typed `this`.) */
    setData<TX_, TY_, TDatum_>(dataDescription: DataDescription<TX_, TY_, TDatum_>): State<TX_, TY_, TDatum_> {
        const { array2d, xDomain, yDomain } = DataDescription.toArray2D(dataDescription);
        const self = this as unknown as State<TX_, TY_, TDatum_>;
        self.originalData = dataDescription;
        self.xDomain = xDomain;
        self.yDomain = yDomain;
        self.setDataArray(array2d);
        return self;
    }

    /** Set `this.dataArray`, adjust zoom as necessary, and emit related events. */
    private setDataArray(dataArray: Array2D<TDatum | undefined>): void {
        this.dataArray = dataArray;
        const newWholeWorld = Box.create(0, 0, dataArray.nColumns, dataArray.nRows);
        const xScale = Box.width(newWholeWorld) / Box.width(this.boxes.wholeWorld);
        const yScale = Box.height(newWholeWorld) / Box.height(this.boxes.wholeWorld);
        this.boxes.wholeWorld = newWholeWorld;
        this.boxes.visWorld = Box.clamp({
            xmin: this.boxes.visWorld.xmin * xScale,
            xmax: this.boxes.visWorld.xmax * xScale,
            ymin: this.boxes.visWorld.ymin * yScale,
            ymax: this.boxes.visWorld.ymax * yScale
        }, newWholeWorld, { width: MIN_ZOOMED_DATAPOINTS_HARD, height: MIN_ZOOMED_DATAPOINTS_HARD });
        this.scales = Scales(this.boxes);
        this.events.data.next(undefined);
        this.emitZoom('setDataArray');
    }


    /** Return the data cell that is being pointed by the mouse in `event`.
     * Return `undefined` if there is no such cell.
     * Return a cell with `datum: undefined` if there is a cell but it is empty. */
    getPointedCell(event: MouseEvent | undefined): CellEventValue<TX, TY, TDatum>['cell'] {
        if (!event) {
            return undefined;
        }
        const xIndex = Math.floor(this.scales.canvasToWorld.x(event.offsetX));
        const yIndex = Math.floor(this.scales.canvasToWorld.y(event.offsetY));
        const datum = Array2D.get(this.dataArray, xIndex, yIndex);
        const x = this.xDomain.values[xIndex];
        const y = this.yDomain.values[yIndex];
        return { datum, x, y, xIndex, yIndex };
    }

    /** Emit a resize event, with the current size of canvas. */
    emitResize(): void {
        if (!this.dom) return;
        const size = getSize(this.dom.canvas);
        this.events.resize.next(size);
    }

    /** Emit a zoom event, based on the current zoom.
     * `origin` is an identifier of the event originator
     * (to avoid infinite loop when multiple component listen to zoom and change it). */
    emitZoom(origin: string | undefined): void {
        const newZoom = this.getZoomEventValue(origin);
        if (isEqual(newZoom, this.events.zoom.value)) return; // to avoid infinite loops
        this.events.zoom.next(newZoom);
    }

    /** Controls how column/row indices and names are aligned to X and Y axes, when using `.zoom` and `.events.zoom` */
    setAlignment(x: XAlignmentMode | undefined, y: YAlignmentMode | undefined): void {
        if (x) this._xAlignment = x;
        if (y) this._yAlignment = y;
        this.emitZoom('setAlignment');
    }

    /** Get value for zoom event (or related functions), based on the current zoom.
     * `origin` is an identifier of the event originator
     * (to avoid infinite loop when multiple component listen to zoom and change it). */
    private getZoomEventValue(origin: string | undefined): ZoomEventValue<TX, TY> | undefined {
        const box = this.boxes.visWorld;
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

    /** Retrieve xmin/xmax/ymin/ymax (float) for visible world box from a partial ZoomEventValue `z`,
     * using `xMinIndex` or `xMin` or `xFirstVisibleIndex` or `xFirstVisible` in this order of precedence
     * (or equivalent for x/y, min/max), and adjusting for alignment shift. */
    private getIndexFromZoomRequest(axis: 'x' | 'y', end: 'Min' | 'Max', z: Partial<ZoomEventValue<TX, TY>> | undefined): number | undefined {
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

    /** Enforce change of zoom and return the zoom value after the change */
    zoom(z: Partial<ZoomEventValue<TX, TY>> | undefined): ZoomEventValue<TX, TY> | undefined {
        const visWorldBox = Box.clamp({
            xmin: this.getIndexFromZoomRequest('x', 'Min', z) ?? this.boxes.wholeWorld.xmin,
            xmax: this.getIndexFromZoomRequest('x', 'Max', z) ?? this.boxes.wholeWorld.xmax,
            ymin: this.getIndexFromZoomRequest('y', 'Min', z) ?? this.boxes.wholeWorld.ymin,
            ymax: this.getIndexFromZoomRequest('y', 'Max', z) ?? this.boxes.wholeWorld.ymax,
        }, this.boxes.wholeWorld, { width: MIN_ZOOMED_DATAPOINTS_HARD, height: MIN_ZOOMED_DATAPOINTS_HARD });

        this.zoomVisWorldBox(visWorldBox, z?.origin);
        return this.getZoomEventValue(z?.origin);
    }

    /** Set the visible world box to `visWorldBox`, update scales and emit zoom event accordingly. */
    zoomVisWorldBox(visWorldBox: Box, origin?: string, emit: boolean = true): void {
        this.boxes.visWorld = visWorldBox;
        this.scales = Scales(this.boxes);
        if (emit) this.emitZoom(origin);
    }

    /** Return current zoom */
    getZoom(): ZoomEventValue<TX, TY> | undefined {
        return this.getZoomEventValue(undefined);
    }
}


/** Return a number that has to be added world coordinates to get zoom coordinates (adjustment for column/row alignment). */
function indexAlignmentShift(alignment: XAlignmentMode | YAlignmentMode): 0 | -0.5 | -1 {
    if (alignment === 'left' || alignment === 'top') return 0;
    if (alignment === 'center') return -0.5;
    return -1;
}
