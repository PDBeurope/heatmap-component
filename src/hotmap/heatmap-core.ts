import { Class } from './class-names';
import * as d3 from './d3-modules';
import { ExtensionInstance, HotmapExtension } from './extension';
import { Scales } from './scales';
import { DataDescription, State } from './state';
import { attrd } from './utils';


/** Initial size set to canvas (doesn't really matter because it will be immediately resized to the real size) */
const CANVAS_INIT_SIZE = { width: 100, height: 100 };


export class HeatmapCore<TX, TY, TItem> {
    protected readonly state: State<TX, TY, TItem>;

    registerBehavior<TParams extends {}, TDefaults extends TParams>(behavior: HotmapExtension<TParams, TDefaults>, params?: Partial<TParams>): ExtensionInstance<TParams> {
        const behaviorInstance = behavior.create(this.state, params);
        behaviorInstance.register();
        return behaviorInstance;
    }

    constructor(data: DataDescription<TX, TY, TItem>) {
        this.state = new State(data);

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

        svg.on('mousemove.hotmapcore', (e: MouseEvent) => this.state.events.hover.next(this.state.getPointedItem(e)));
        svg.on('mouseleave.hotmapcore', (e: MouseEvent) => this.state.events.hover.next(undefined));
        svg.on('click.hotmapcore', (e: MouseEvent) => this.state.events.click.next(this.state.getPointedItem(e)));

        this.state.events.render.next(undefined);
        this.state.emitResize();
        d3.select(window).on('resize.resizehotmapcanvas', () => this.state.emitResize());

        console.timeEnd('Hotmap render');
        return this;
    }

    /** Clear all the contents of the root div. */
    remove(): void {
        if (!this.state.dom) return;
        this.state.dom.rootDiv.select('*').remove();
    }
}
