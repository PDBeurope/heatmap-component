import { BehaviorSubject } from 'rxjs';
import { Data } from './data';
import { Domain } from './domain';
import { DataDescription, ItemEventParam, Provider, XAlignmentMode, YAlignmentMode, ZoomEventParam } from './heatmap';
import { Box, Boxes, Scales } from './scales';


export class State<TX, TY, TItem> { // TODO: try to convert to object if makes sense, ensure mandatory props are set in constructor
    originalData: DataDescription<TX, TY, TItem>;
    data: Data<TItem>;
    xDomain: Domain<TX>;
    yDomain: Domain<TY>;
    zoomBehavior?: d3.ZoomBehavior<Element, unknown>;
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
    readonly lastWheelEvent = { timestamp: 0, absDelta: 0, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false };

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
}
