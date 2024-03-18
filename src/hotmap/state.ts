import { BehaviorSubject } from 'rxjs';
import { Color } from './color';
import { Data } from './data';
import { Domain } from './domain';
import { Downsampler } from './downsampling';
import { DataDescription, DefaultColorProvider, DefaultVisualParams, ItemEventParam, Provider, VisualParams, XAlignmentMode, YAlignmentMode, ZoomEventParam } from './heatmap';
import { Box, Boxes, Scales, XY } from './scales';


export class State<TX, TY, TItem> { // TODO: try to convert to object if makes sense, ensure mandatory props are set in constructor
    originalData: DataDescription<TX, TY, TItem>;
    data: Data<TItem>;
    downsampler?: Downsampler<'image'>;
    xDomain: Domain<TX>;
    yDomain: Domain<TY>;
    zoomBehavior?: d3.ZoomBehavior<Element, unknown>;
    xAlignment: XAlignmentMode = 'center';
    yAlignment: YAlignmentMode = 'center';

    colorProvider: Provider<TX, TY, TItem, string | Color> = DefaultColorProvider;
    filter?: Provider<TX, TY, TItem, boolean> = undefined;
    visualParams: VisualParams = DefaultVisualParams;
    /** DOM elements managed by this component */
    dom?: {
        rootDiv: d3.Selection<HTMLDivElement, any, any, any>;
        mainDiv: d3.Selection<HTMLDivElement, any, any, any>;
        canvasDiv: d3.Selection<HTMLDivElement, any, any, any>;
        canvas: d3.Selection<HTMLCanvasElement, any, any, any>;
        svg: d3.Selection<SVGSVGElement, any, any, any>;
    };
    /** Canvas rendering context */
    ctx?: CanvasRenderingContext2D;
    boxes: Boxes;
    scales: Scales;
    /** Approximate width of a rectangle in pixels, when showing downsampled data.
     * (higher value means more responsive but lower-resolution visualization) */
    downsamplingPixelsPerRect = 1;
    /** Position of the pinned tooltip, if any. In world coordinates, continuous. Use `Math.floor` to get column/row index. */
    pinnedTooltip?: XY = undefined;
    readonly lastWheelEvent = { timestamp: 0, absDelta: 0, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };


    public readonly events = {
        hover: new BehaviorSubject<ItemEventParam<TX, TY, TItem>>(undefined),
        click: new BehaviorSubject<ItemEventParam<TX, TY, TItem>>(undefined),
        zoom: new BehaviorSubject<ZoomEventParam<TX, TY, TItem>>(undefined),
        resize: new BehaviorSubject<Box | undefined>(undefined),
    } as const;
}
