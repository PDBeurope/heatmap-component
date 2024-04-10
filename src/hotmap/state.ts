import { clamp, isNil, round } from 'lodash';
import { BehaviorSubject } from 'rxjs';
import * as d3 from './d3-modules';
import { Data } from './data';
import { Domain } from './domain';
import { DataDescription, ItemEventParam, Provider, XAlignmentMode, YAlignmentMode, ZoomEventParam } from './heatmap';
import { Box, Boxes, Scales } from './scales';
import { nextIfChanged } from './utils';


/** Avoid zooming to things like 0.4999999999999998 */
const ZOOM_EVENT_ROUNDING_PRECISION = 9;
export const MIN_ZOOMED_DATAPOINTS_HARD = 1;


export class State<TX, TY, TItem> { // TODO: try to convert to object if makes sense, ensure mandatory props are set in constructor
    originalData: DataDescription<TX, TY, TItem>;
    data: Data<TItem>;
    xDomain: Domain<TX>;
    yDomain: Domain<TY>;
    xAlignment: XAlignmentMode = 'center';
    yAlignment: YAlignmentMode = 'center';

    filter?: Provider<TX, TY, TItem, boolean> = undefined;
    /** DOM elements managed by this component */
    dom?: {
        rootDiv: d3.Selection<HTMLDivElement, any, any, any>;
        mainDiv: d3.Selection<HTMLDivElement, any, any, any>;
        canvasDiv: d3.Selection<HTMLDivElement, any, any, any>;
        canvas: d3.Selection<HTMLCanvasElement, any, any, any>; // TODO move to DrawExtension, create on render event
        svg: d3.Selection<SVGSVGElement, any, any, any>;
    };
    boxes: Boxes;
    scales: Scales;

    public readonly events = {
        hover: new BehaviorSubject<ItemEventParam<TX, TY, TItem>>(undefined),
        click: new BehaviorSubject<ItemEventParam<TX, TY, TItem>>(undefined),
        zoom: new BehaviorSubject<ZoomEventParam<TX, TY, TItem>>(undefined),
        resize: new BehaviorSubject<Box | undefined>(undefined),
        /** Fires when the visualized data change (including filter or domain change) */
        data: new BehaviorSubject<Data<TItem> | undefined>(undefined),
        /** Fires when the component is initially render in a div */
        render: new BehaviorSubject<undefined>(undefined),
    } as const;


    /** Return data item that is being pointed by the mouse in `event` */
    getPointedItem(event: MouseEvent | undefined): ItemEventParam<TX, TY, TItem> {
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

    emitZoom(origin?: string): void {
        console.log('emitZoom', origin)
        if (this.boxes.visWorld) {
            nextIfChanged(this.events.zoom, this.zoomParamFromVisWorld(this.boxes.visWorld, origin));
        }
    }

    private zoomParamFromVisWorld(box: Box | undefined, origin?: string): ZoomEventParam<TX, TY, TItem> {
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

    /** Enforce change of zoom and return the zoom value after the change */
    zoom(z: Partial<ZoomEventParam<TX, TY, TItem>> | undefined, origin?: string): ZoomEventParam<TX, TY, TItem> {
        // if (!this.dom || !this.zoomBehavior) return undefined;

        const visWorldBox = Box.clamp({
            xmin: this.getZoomRequestIndexMagic('x', 'Min', z) ?? this.boxes.wholeWorld.xmin,
            xmax: this.getZoomRequestIndexMagic('x', 'Max', z) ?? this.boxes.wholeWorld.xmax,
            ymin: this.getZoomRequestIndexMagic('y', 'Min', z) ?? this.boxes.wholeWorld.ymin,
            ymax: this.getZoomRequestIndexMagic('y', 'Max', z) ?? this.boxes.wholeWorld.ymax,
        }, this.boxes.wholeWorld, MIN_ZOOMED_DATAPOINTS_HARD, MIN_ZOOMED_DATAPOINTS_HARD);

        this.zoomVisWorldBox(visWorldBox, origin);

        // const xScale = Box.width(this.boxes.canvas) / Box.width(visWorldBox);
        // const yScale = Box.height(this.boxes.canvas) / Box.height(visWorldBox);
        // const transform = d3.zoomIdentity.scale(xScale).translate(-visWorldBox.xmin, 0);
        // this.zoomBehavior.transform(this.dom.svg as any, transform);

        return this.zoomParamFromVisWorld(visWorldBox, origin);
    }

    zoomVisWorldBox(visWorldBox: Box, origin?: string): void {
        console.log('zoom', origin)
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
