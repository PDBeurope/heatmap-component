import { range } from 'lodash';
import * as d3 from './d3-modules';
import { Array2D } from './data/array2d';
import { Color } from './data/color';
import { ExtensionInstance, ExtensionInstanceRegistration, HotmapExtension } from './extension';
import { DefaultNumericColorProviderFactory, DrawExtension, DrawExtensionParams, VisualParams } from './extensions/draw';
import { MarkerExtension, MarkerExtensionParams } from './extensions/marker';
import { DefaultTooltipExtensionParams, TooltipExtension, TooltipExtensionParams } from './extensions/tooltip';
import { ZoomExtension, ZoomExtensionParams } from './extensions/zoom';
import { Box, Scales } from './scales';
import { DataDescription, Provider, State, XAlignmentMode, YAlignmentMode, ZoomEventParam } from './state';
import { attrd, getSize, removeElement } from './utils';


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
        marker?: ExtensionInstanceRegistration<MarkerExtensionParams>,
        tooltip?: ExtensionInstanceRegistration<TooltipExtensionParams<TX, TY, TItem>>,
        draw?: ExtensionInstanceRegistration<DrawExtensionParams<TX, TY, TItem>>,
        zoom?: ExtensionInstanceRegistration<ZoomExtensionParams>,
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
            visWorld: Box.create(0, 0, this.state.dataArray.nColumns, this.state.dataArray.nRows),
            wholeWorld: Box.create(0, 0, this.state.dataArray.nColumns, this.state.dataArray.nRows),
            canvas: Box.create(0, 0, CANVAS_INIT_SIZE.width, CANVAS_INIT_SIZE.height), // To be changed via 'resize' event subscription
        };

        this.events.resize.subscribe(box => {
            if (!box) return;
            this.state.boxes.canvas = box;
            this.state.boxes.canvas = box;
            this.state.scales = Scales(this.state.boxes);
        });

        let colorProvider: Provider<TX, TY, TItem, Color> | undefined = undefined;
        if (this.state.dataArray.isNumeric) {
            const dataRange = Array2D.getRange(this.state.dataArray as Array2D<number>);
            colorProvider = DefaultNumericColorProviderFactory(dataRange.min, dataRange.max) as Provider<TX, TY, TItem, Color>;
            // (this as unknown as Heatmap<TX, TY, number>).setColor(colorProvider);
        }
        this.extensions.marker = this.registerBehavior(MarkerExtension);
        this.extensions.tooltip = this.registerBehavior(TooltipExtension);
        this.extensions.draw = this.registerBehavior(DrawExtension, { colorProvider });
        this.extensions.zoom = this.registerBehavior(ZoomExtension);
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

    setData<TX_, TY_, TItem_>(data: DataDescription<TX_, TY_, TItem_>): Heatmap<TX_, TY_, TItem_> {
        this.state.setData(data);
        return this as unknown as Heatmap<TX_, TY_, TItem_>;
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

    /** Change filter function without changing the underlying data (can be used for showing/hiding individual data items). */
    setFilter(filter: Provider<TX, TY, TItem, boolean> | undefined): this {
        this.setData({
            ...this.state.originalData,
            filter: filter,
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
    setColor(colorProvider: Provider<TX, TY, TItem, string | Color>): this {
        this.extensions.draw?.update({ colorProvider });
        return this;
    }

    setTooltip(tooltipProvider: Provider<TX, TY, TItem, string> | 'default' | null): this {
        this.extensions.tooltip?.update({
            tooltipProvider: (tooltipProvider === 'default') ? DefaultTooltipExtensionParams.tooltipProvider : tooltipProvider,
        });
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
        this.state.emitZoom('setAlignment');
        return this;
    }

    /** Enforce change of zoom and return the zoom value after the change */
    zoom(z: Partial<ZoomEventParam<TX, TY, TItem>> | undefined, origin?: string): ZoomEventParam<TX, TY, TItem> {
        return this.state.zoom(z, origin);
    }

    /** Return current zoom */
    getZoom(): ZoomEventParam<TX, TY, TItem> {
        return this.state.getZoom();
    }
}


function makeRandomData(nColumns: number, nRows: number): DataDescription<number, number, number> {
    const raw = Array2D.createRandom(nColumns, nRows);
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
