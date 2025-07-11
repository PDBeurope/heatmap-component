import { Class } from './class-names';
import * as d3 from './d3-modules';
import { DataDescription } from './data/data-description';
import { Behavior, Extension } from './extension';
import { Box, Scales } from './scales';
import { State } from './state';
import { attrd } from './utils';


/** This class provides very basic functionality for a heatmap,
 * i.e. state keeping, rendering to HTML, and a mechanism for adding extensions.
 * More functionality is added via extensions in the `Heatmap` class.
 * `HeatmapCore` is not really usable alone, but could be useful in custom builds. */
export class HeatmapCore<TX, TY, TDatum> {
    /** Encapsulates the state of the heatmap instance.
     * Shared between the heatmap instance and all registered behaviors. */
    protected readonly state: State<TX, TY, TDatum>;

    private sizeObserver?: ResizeObserver;

    constructor(dataDescription: DataDescription<TX, TY, TDatum>) {
        this.state = new State(dataDescription);

        this.state.events.resize.subscribe(size => {
            if (!size) return;
            const canvasScale = this.state.canvasScale;
            this.state.boxes.svg = Box.create(0, 0, size.width, size.height);
            this.state.boxes.canvasContext = Box.create(0, 0, canvasScale * size.width, canvasScale * size.height);
            this.state.scales = Scales(this.state.boxes);
        });
        this.state.events.hover.subscribe(e => this.state.dom?.svg.attr('pointing-data', (e.cell?.datum !== undefined) ? '' : null));
    }

    /** Update `canvasScale` based on screen resolution and browser zoom level. */
    private updateCanvasScale() {
        const devicePixelRatio = window?.devicePixelRatio ?? 1;
        if (devicePixelRatio === this.state.canvasScale) return;
        this.state.canvasScale = devicePixelRatio;
        this.state.events.resize.next(this.state.events.resize.value);
    }

    /** Register an extension with this heatmap, i.e. create a behavior bound to the state of this heatmap. */
    registerExtension<TParams extends {}, TDefaults extends TParams>(extension: Extension<TParams, TDefaults>, params?: Partial<TParams>): Behavior<TParams> {
        const behavior = extension.create(this.state, params);
        behavior.register();
        return behavior;
    }

    /** Render this heatmap in the given DIV element. */
    render(divElementOrId: HTMLDivElement | string): this {
        if (this.state.dom) {
            console.error(`This ${this.constructor.name} has already been rendered in element`, this.state.dom.rootDiv.node());
            throw new Error(`This ${this.constructor.name} has already been rendered. Cannot render again.`);
        }

        // Rendering this DOM structure:
        // <div id="${divElementOrId}">                          // dom.rootDiv   - existing div provided by the caller
        //     <div class="heatmap-main-div"">                   // dom.mainDiv   - whole heatmap component (possibly including axis labels etc. in future)
        //         <div class="heatmap-canvas-div"">             // dom.canvasDiv - canvas parts of the component (ensures perfect alignment of <canvas> and <svg>)
        //             <canvas class="heatmap-canvas"></canvas>  // dom.canvas    - used to draw data efficiently, no interactivity
        //             <svg class="heatmap-svg"></svg>           // dom.svg       - used to add interactivity (event listeners) and render simple things, e.g. markers
        //         </div>
        //     </div>
        // </div>

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
            class: Class.Canvas,
            width: 100, // Initial canvas size doesn't matter because it will be immediately resized
            height: 100, // Initial canvas size doesn't matter because it will be immediately resized
            style: { position: 'absolute', width: '100%', height: '100%' },
        });

        const svg = attrd(canvasDiv.append('svg'), {
            class: Class.Svg,
            style: { position: 'absolute', width: '100%', height: '100%' },
        });
        this.state.dom = { rootDiv, mainDiv, canvasDiv, canvas, svg };

        // Add event listeners
        svg.on('mousemove.heatmapcore', (e: MouseEvent) => this.state.events.hover.next({
            cell: this.state.getPointedCell(e),
            sourceEvent: e,
        }));
        svg.on('mouseleave.heatmapcore', (e: MouseEvent) => this.state.events.hover.next({
            cell: undefined,
            sourceEvent: e,
        }));
        svg.on('click.heatmapcore', (e: MouseEvent) => this.state.events.select.next({
            cell: this.state.getPointedCell(e),
            sourceEvent: e,
        }));

        this.state.events.render.next(undefined);
        this.sizeObserver = new ResizeObserver(() => this.state.emitResize());
        for (const node of canvas.nodes()) {
            this.sizeObserver.observe(node);
        }
        this.updateCanvasScale();
        d3.select(window).on('resize.updateCanvasScale', () => this.updateCanvasScale());

        return this;
    }

    /** Clear all the contents of the root div. */
    remove(): void {
        this.sizeObserver?.disconnect();
        this.sizeObserver = undefined;

        if (!this.state.dom) return;
        this.state.dom.rootDiv.select('*').remove();
    }
}
