import { Class } from './class-names';
import * as d3 from './d3-modules';
import { DataDescription } from './data/data-description';
import { Behavior, HeatmapExtension } from './extension';
import { Scales } from './scales';
import { State } from './state';
import { attrd } from './utils';


export class HeatmapCore<TX, TY, TDatum> {
    protected readonly state: State<TX, TY, TDatum>;

    registerExtension<TParams extends {}, TDefaults extends TParams>(extension: HeatmapExtension<TParams, TDefaults>, params?: Partial<TParams>): Behavior<TParams> {
        const behavior = extension.create(this.state, params);
        behavior.register();
        return behavior;
    }

    constructor(dataDescription: DataDescription<TX, TY, TDatum>) {
        this.state = new State(dataDescription);

        this.state.events.resize.subscribe(box => {
            if (!box) return;
            this.state.boxes.canvas = box;
            this.state.scales = Scales(this.state.boxes);
        });
    }

    /** Render this heatmap in the given DIV element */
    render(divElementOrId: HTMLDivElement | string): this {
        if (this.state.dom) {
            console.error(`This ${this.constructor.name} has already been rendered in element`, this.state.dom.rootDiv.node());
            throw new Error(`This ${this.constructor.name} has already been rendered. Cannot render again.`);
        }
        console.time('Heatmap render');

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
            width: 100, // Initial canvas size doesn't matter because it will be immediately resized
            height: 100, // Initial canvas size doesn't matter because it will be immediately resized
            style: { position: 'absolute', width: '100%', height: '100%' },
        });

        const svg = attrd(canvasDiv.append('svg'), {
            style: { position: 'absolute', width: '100%', height: '100%' },
        });
        this.state.dom = { rootDiv, mainDiv, canvasDiv, canvas, svg };

        svg.on('mousemove.heatmapcore', (e: MouseEvent) => this.state.events.hover.next(this.state.getPointedCell(e)));
        svg.on('mouseleave.heatmapcore', (e: MouseEvent) => this.state.events.hover.next(undefined));
        svg.on('click.heatmapcore', (e: MouseEvent) => this.state.events.select.next(this.state.getPointedCell(e)));

        this.state.events.render.next(undefined);
        this.state.emitResize();
        d3.select(window).on('resize.resizeheatmapcanvas', () => this.state.emitResize());

        console.timeEnd('Heatmap render');
        return this;
    }

    /** Clear all the contents of the root div. */
    remove(): void {
        if (!this.state.dom) return;
        this.state.dom.rootDiv.select('*').remove();
    }
}
