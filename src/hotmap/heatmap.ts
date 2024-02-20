import * as d3 from 'd3';
import { BehaviorSubject } from 'rxjs';
import { Data, Downsampling, getDataItem, makeRandomRawData } from './data';
import { Box, BoxSize, Boxes, Scales, scaleDistance } from './scales';
import { attrd, getSize, nextIfChanged } from './utils';


// TODO: zoom event
// TODO: handle resize
// TODO: configurable rect x and y margins
// TODO: style via CSS file, avoid inline styles
// TODO: use OrRd color scale automatically when data are numeric?
// TODO: think in more depth what could happen when changing data type with filters, providers, etc. already set

const AppName = 'hotmap';
const Class = {
    MainDiv: `${AppName}-main-div`,
    CanvasDiv: `${AppName}-canvas-div`,
    Marker: `${AppName}-marker`,
    Tooltip: `${AppName}-tooltip`,
    Overlay: `${AppName}-overlay`,
}
const MIN_ZOOMED_DATAPOINTS = 1;


export type DataDescription<TX, TY, TItem> = {
    xDomain: TX[],  // TODO: | (TX extends number ? { min: TX, max: TX } : never),
    yDomain: TY[],
    /** Data items to show in the heatmap (each item is visualized as a rectangle) */
    items: TItem[],
    /** X values for the data items (either an array with the X values (must have the same length as `items`), or a function that computes X value for given item)  */
    x: ((dataItem: TItem, index: number) => TX) | TX[],
    /** Y values for the data items (either an array with the Y values (must have the same length as `items`), or a function that computes X value for given item)  */
    y: ((dataItem: TItem, index: number) => TY) | TY[],
}

/** Types of input parameters of provider functions (that are passed to setTooltip etc.) */
type ProviderParams<TX, TY, TItem> = [d: TItem, x: TX, y: TY, xIndex: number, yIndex: number]

type Provider<TX, TY, TItem, TResult> = (...args: ProviderParams<TX, TY, TItem>) => TResult

type ItemEventParam<TX, TY, TItem> = { datum: TItem, x: TX, y: TY, xIndex: number, yIndex: number } | undefined


const DefaultColorProvider = () => '#888888';
const DefaultNumericColorProvider = d3.scaleSequential(d3.interpolateOrRd);
// const DefaultColorScale = d3.scaleLinear([0, 0.5, 1], ['#2222dd', '#ffffff', '#dd2222']);

function DefaultTooltipProvider(dataItem: unknown, x: unknown, y: unknown, xIndex: number, yIndex: number): string {
    return `x index: ${xIndex}<br>y index: ${yIndex}<br>x value: ${x}<br>y value: ${y}<br>item: ${formatDataItem(dataItem)}`;
}


export class Heatmap<TX, TY, TItem> {
    private originalData: DataDescription<TX, TY, TItem>;
    private data: Data<TItem>;
    private downsampling: TItem extends number ? Downsampling<TItem> : undefined;
    private xDomain: TX[];
    private yDomain: TY[];
    private xDomainIndex: Map<TX, number>;
    private yDomainIndex: Map<TY, number>;
    private zoomBehavior?: d3.ZoomBehavior<Element, unknown>;

    private colorProvider: Provider<TX, TY, TItem, string> = DefaultColorProvider;
    private tooltipProvider: Provider<TX, TY, TItem, string> = DefaultTooltipProvider;
    private filter?: Provider<TX, TY, TItem, boolean> = undefined;
    public readonly events = {
        hover: new BehaviorSubject<ItemEventParam<TX, TY, TItem>>(undefined),
        click: new BehaviorSubject<ItemEventParam<TX, TY, TItem>>(undefined),
    } as const;

    private rootDiv: d3.Selection<HTMLDivElement, any, any, any>;
    private mainDiv: d3.Selection<HTMLDivElement, any, any, any>;
    private canvas: d3.Selection<HTMLCanvasElement, any, any, any>;
    private svg: d3.Selection<SVGSVGElement, any, any, any>;
    private readonly canvasInnerSize: BoxSize = { width: window.screen.width, height: window.screen.height }; // setting canvas size to screen size to avoid upscaling at any window size
    private ctx: CanvasRenderingContext2D;
    private canvasDomSize: BoxSize;
    private boxes: Boxes;
    private scales: Scales;
    /** Approximate width of a rectangle in pixels, when showing downsampled data.
     * (higher value means more responsive but shittier visualization)
     * TODO try setting this dynamically, based on rendering times */
    private downsamplingPixelsPerRect = 4;


    static create(): Heatmap<number, number, number>
    static create<TX_, TY_, TItem_>(data: DataDescription<TX_, TY_, TItem_>): Heatmap<TX_, TY_, TItem_>
    static create<TX_, TY_, TItem_>(data?: DataDescription<TX_, TY_, TItem_>): Heatmap<TX_, TY_, TItem_> | Heatmap<number, number, number> {
        if (data !== undefined) {
            return new this(data);
        } else {
            return new this(makeRandomData(100, 20)).setColor(DefaultNumericColorProvider);
        }
    }

    private constructor(data: DataDescription<TX, TY, TItem>) {
        this.setData(data);
    }

    /** Clear all the contents of the root div. */
    remove(): void {
        if (!this.rootDiv) return;
        this.rootDiv.select('*').remove();
    }

    /** Render this heatmap in the given DIV element */
    render(divElementOrId: HTMLDivElement | string): this {
        if (this.rootDiv) {
            console.error(`This ${this.constructor.name} has already been rendered in element`, this.rootDiv.node());
            throw new Error(`This ${this.constructor.name} has already been rendered. Cannot render again.`);
        }
        console.time('Hotmap render')

        this.rootDiv = (typeof divElementOrId === 'string') ? d3.select(`#${divElementOrId}`) : d3.select(divElementOrId);
        if (this.rootDiv.empty()) throw new Error('Failed to initialize, wrong div ID?');
        this.remove();

        this.mainDiv = attrd(this.rootDiv.append('div'), {
            class: Class.MainDiv,
            style: { position: 'relative', width: '100%', height: '100%', backgroundColor: 'white' },
        });

        const canvasDiv = attrd(this.mainDiv.append('div'), {
            class: Class.CanvasDiv,
            style: {
                position: 'absolute',
                // left: '20px', right: '20px', top: '20px', bottom: '20px',
                left: '0px', right: '0px', top: '0px', bottom: '0px',
                // border: 'solid black 1px',
            },
        });

        this.canvas = attrd(canvasDiv.append('canvas'), {
            width: this.canvasInnerSize.width,
            height: this.canvasInnerSize.height,
            style: { position: 'absolute', width: '100%', height: '100%' },
        });
        this.canvasDomSize = getSize(this.canvas);

        this.svg = attrd(canvasDiv.append('svg'), {
            style: { position: 'absolute', width: '100%', height: '100%' },
        })

        const ctx = this.canvas.node()?.getContext('2d');
        if (ctx) this.ctx = ctx;
        else throw new Error('Failed to initialize canvas');

        this.boxes = {
            visWorld: Box(0, 0, this.data.nColumns, this.data.nRows),
            wholeWorld: Box(0, 0, this.data.nColumns, this.data.nRows),
            dom: Box(0, 0, this.canvasDomSize.width, this.canvasDomSize.height),
            canvas: Box(0, 0, this.canvasInnerSize.width, this.canvasInnerSize.height),
        };
        this.scales = Scales(this.boxes);

        this.renderData();

        for (const eventName in this.handlers) {
            this.svg.on(eventName, e => this.handlers[eventName as keyof typeof this.handlers](e));
            // wheel event must be subscribed before setting zoom
        }
        this.applyZoom();
        // TODO handle resize!

        console.timeEnd('Hotmap render')
        return this;
    }

    private setRawData(data: Data<TItem>): this {
        this.data = data;
        if (typeof data.items[0] === 'number') {
            (this as unknown as Heatmap<any, any, number>).downsampling = Downsampling.create(data as Data<number>);
        } else {
            (this as Heatmap<any, any, Exclude<any, number>>).downsampling = undefined;
        }
        // TODO update world and visWorld
        // TODO trigger data render
        this.renderData();
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
        const xDomainIndex = new Map(xDomain.map((x, i) => [x, i])); // TODO avoid creating array of arrays
        const yDomainIndex = new Map(yDomain.map((y, i) => [y, i])); // TODO avoid creating array of arrays
        let warned = false;
        for (let i = 0; i < items.length; i++) {
            const d = items[i];
            const x = xs[i];
            const y = ys[i];
            const ix = xDomainIndex.get(x);
            const iy = yDomainIndex.get(y);
            if (ix === undefined) {
                if (!warned) {
                    console.warn('Some data items map to X values out of the X domain.'); // TODO add details
                    warned = true;
                }
            } else if (iy === undefined) {
                if (!warned) {
                    console.warn('Some data items map to Y values out of the Y domain.'); // TODO add details
                    warned = true;
                }
            } else if (self.filter !== undefined && !self.filter(d, x, y, ix, iy)) {
                // skipping this item
            } else {
                array[nColumns * iy + ix] = d;
            }
        }
        self.originalData = data;
        self.setRawData({ items: array, nRows, nColumns });
        self.xDomain = xDomain;
        self.yDomain = yDomain;
        self.xDomainIndex = xDomainIndex;
        self.yDomainIndex = yDomainIndex;
        return self;
    }
    setColor(colorProvider: (...args: ProviderParams<TX, TY, TItem>) => string): this {
        this.colorProvider = colorProvider;
        return this;
    }
    setTooltip(tooltipProvider: (...args: ProviderParams<TX, TY, TItem>) => string): this { // TODO: type: 'text' | 'html' = 'html'?, TODO: allow resetting default tooltip and disabling it altogether
        this.tooltipProvider = tooltipProvider;
        return this;
    }
    setFilter(filter: ((...args: ProviderParams<TX, TY, TItem>) => boolean) | undefined): this {
        this.filter = filter;
        this.setData(this.originalData); // reapplies filter
        return this;
    }

    private getDataItem(x: number, y: number): TItem | undefined {
        return getDataItem(this.data, x, y);
    }
    private renderData() {
        if (!this.rootDiv) return;
        const xResolution = this.canvasDomSize.width / this.downsamplingPixelsPerRect;
        const colFrom = Math.floor(this.boxes.visWorld.xmin);
        const colTo = Math.ceil(this.boxes.visWorld.xmax); // exclusive
        const downsamplingCoefficient = Downsampling.downsamplingCoefficient(colTo - colFrom, xResolution);
        const downsampled = this.downsampling ? Downsampling.getDownsampled(this.downsampling, downsamplingCoefficient) : this.data;
        return this.renderTheseData(downsampled, downsamplingCoefficient);
    }
    private renderTheseData(data: Data<TItem>, scale: number) {
        if (!this.rootDiv) return;
        // this.ctx.resetTransform(); this.ctx.scale(scale, 1);
        this.ctx.clearRect(0, 0, this.canvasInnerSize.width, this.canvasInnerSize.height);
        const width = scaleDistance(this.scales.worldToCanvas.x, 1) * scale;
        const height = scaleDistance(this.scales.worldToCanvas.y, 1);
        const xGap = scale === 1 ? Math.min(scaleDistance(this.scales.domToCanvas.x, 1), 0.1 * width) : 0; // 1px on screen or 10% of the rect width
        const yGap = scaleDistance(this.scales.domToCanvas.y, 1); // 1px on screen
        const colFrom = Math.floor(this.boxes.visWorld.xmin / scale);
        const colTo = Math.ceil(this.boxes.visWorld.xmax / scale); // exclusive

        for (let iy = 0; iy < data.nRows; iy++) {
            for (let ix = colFrom; ix < colTo; ix++) {
                const item = getDataItem(data, ix, iy);
                if (item === undefined) continue;
                this.ctx.fillStyle = this.colorProvider(item, this.xDomain[ix], this.yDomain[iy], ix, iy);
                const x = this.scales.worldToCanvas.x(ix * scale);
                const y = this.scales.worldToCanvas.y(iy);
                this.ctx.fillRect(x + xGap, y + yGap, width - 2 * xGap, height - 2 * yGap);
            }
        }
    }

    private applyZoom() {
        if (this.zoomBehavior) {
            // Remove any old behavior
            this.zoomBehavior.on("zoom", null);
        }
        this.zoomBehavior = d3.zoom();
        this.zoomBehavior.filter(e => {
            if (e instanceof WheelEvent) {
                return e.ctrlKey && !e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX);
            } else {
                return true;
            }
        })
        this.zoomBehavior.on('zoom', e => {
            this.boxes.visWorld = {
                ...this.boxes.visWorld, // preserve Y zoom
                xmin: (this.boxes.dom.xmin - e.transform.x) / e.transform.k,
                xmax: (this.boxes.dom.xmax - e.transform.x) / e.transform.k,
            };
            this.scales = Scales(this.boxes);
            this.handleHover(e.sourceEvent);
            this.renderData();
        });
        this.svg.call(this.zoomBehavior as any);
        // .on('wheel', e => e.preventDefault()); // Prevent fallback to normal scroll when on min/max zoom
        const minZoom = this.canvasDomSize.width / (this.boxes.wholeWorld.xmax - this.boxes.wholeWorld.xmin); // zoom-out
        const maxZoom = Math.max(this.canvasDomSize.width / MIN_ZOOMED_DATAPOINTS, minZoom); // zoom-in
        this.zoomBehavior.scaleExtent([minZoom, maxZoom]);
        // No idea how .translateExtent works properly without knowing canvas size (should be .extent), but somehow it does
        // this.zoomBehavior.extent([[this.boxes.canvas.xmin, this.boxes.canvas.ymin], [this.boxes.canvas.xmax, this.boxes.canvas.ymax]]);
        this.zoomBehavior.translateExtent([[this.boxes.wholeWorld.xmin, -Infinity], [this.boxes.wholeWorld.xmax, Infinity]]);
        this.zoomBehavior.transform(this.svg as any, d3.zoomIdentity.scale(minZoom));
        // TODO: limit zooming
    }

    private getPointedItem(event: MouseEvent | undefined): ItemEventParam<TX, TY, TItem> {
        if (!event) {
            return undefined;
        }
        const xIndex = Math.floor(this.scales.domToWorld.x(event.offsetX));
        const yIndex = Math.floor(this.scales.domToWorld.y(event.offsetY));
        const datum = this.getDataItem(xIndex, yIndex);
        if (!datum) {
            return undefined;
        }
        const x = this.xDomain[xIndex];
        const y = this.yDomain[yIndex];
        return { datum, x, y, xIndex, yIndex };
    }

    private handleHover(event: MouseEvent | undefined) {
        const pointed = this.getPointedItem(event);
        nextIfChanged(this.events.hover, pointed);

        if (!event || !pointed) {
            // on mouseleave or when cursor is not at any data point
            this.svg.selectAll('.' + Class.Marker).remove();
            this.mainDiv.selectAll('.' + Class.Tooltip).remove();
            return;
        }

        const marker = this.svg.selectAll('.' + Class.Marker).data([1]);
        const variableAttrs = {
            width: scaleDistance(this.scales.worldToDom.x, 1),
            height: scaleDistance(this.scales.worldToDom.y, 1),
            x: this.scales.worldToDom.x(pointed.xIndex),
            y: this.scales.worldToDom.y(pointed.yIndex),
        };
        attrd(marker.enter().append('rect'), {
            class: Class.Marker,
            stroke: 'black',
            strokeWidth: 3,
            rx: 1,
            ry: 1,
            fill: 'none',
            ...variableAttrs,
        });
        attrd(marker, variableAttrs);

        const tooltip = this.mainDiv.selectAll('.' + Class.Tooltip).data([1]);
        const tooltipLeft = `${(event.clientX ?? 0) + 5}px`;
        const tooltipBottom = `${document.documentElement.clientHeight - (event.clientY ?? 0) + 5}px`;
        const tooltipText = this.tooltipProvider(pointed.datum, pointed.x, pointed.y, pointed.xIndex, pointed.yIndex);
        attrd(tooltip.enter().append('div'), {
            class: Class.Tooltip,
            style: {
                position: 'fixed', left: tooltipLeft, bottom: tooltipBottom,
                backgroundColor: 'white', border: 'solid black 1px', paddingBlock: '0.25em', paddingInline: '0.5em',
            },
        }).html(tooltipText);
        attrd(tooltip, {
            style: { left: tooltipLeft, bottom: tooltipBottom },
        }).html(tooltipText);
    }
    private showScrollingMessage() {
        if (!this.mainDiv.selectAll(`.${Class.Overlay}`).empty()) return;

        const overlay = attrd(this.mainDiv.append('div'), {
            class: Class.Overlay,
            style: { position: 'absolute', width: '100%', height: '100%', pointerEvents: 'none', display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 0 },
        });
        attrd(overlay.append('div'), {
            style: { position: 'absolute', width: '100%', height: '100%', backgroundColor: '#cccccc', opacity: 0.8, zIndex: -1 },
        });
        attrd(overlay.append('div'), {
            style: { paddingInline: '2em', textAlign: 'center', fontSize: '150%', fontWeight: 'bold' },
        }).text('Press Ctrl and scroll to apply zoom');
        setTimeout(() => overlay.remove(), 750);
    }

    private readonly handlers = {
        mousemove: (e: MouseEvent) => this.handleHover(e),
        mouseleave: (e: MouseEvent) => this.handleHover(undefined),
        click: (e: MouseEvent) => this.events.click.next(this.getPointedItem(e)),
        wheel: (e: WheelEvent) => {
            e.preventDefault();
            // Interpret horizontal scroll (and vertical with Shift key) as panning
            if (!this.zoomBehavior) return;
            const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
            const isVertical = Math.abs(e.deltaX) < Math.abs(e.deltaY);
            // ignoring cases when Math.abs(e.deltaX) === Math.abs(e.deltaY)
            const translation = isHorizontal ? e.deltaX : (e.shiftKey && isVertical) ? e.deltaY : 0;
            if (translation !== 0) {
                const shift = scaleDistance(this.scales.domToWorld.x, -translation);
                this.zoomBehavior.translateBy(this.svg as any, shift, 0);
            } else if (isVertical && !e.ctrlKey && Math.abs(e.deltaY) >= 10) {
                this.showScrollingMessage();
            }
            // TODO: relatively scale events from touchpad and wheel
            // TODO: use e.shiftKey and e.ctrlKey from the beginning of the gesture
        },
    } satisfies Record<string, (e: any) => any>;
}


function makeRandomData(nColumns: number, nRows: number): DataDescription<number, number, number> {
    const raw = makeRandomRawData(nColumns, nRows);
    return {
        items: raw.items as number[],
        x: (d, i) => i % nColumns,
        y: (d, i) => Math.floor(i / nColumns),
        xDomain: d3.range(nColumns),
        yDomain: d3.range(nRows),
    }
}

export function formatDataItem(item: any): string {
    if (typeof item === 'number') return item.toFixed(3);
    else return JSON.stringify(item);
}