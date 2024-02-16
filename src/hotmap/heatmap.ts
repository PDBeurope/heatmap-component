import * as d3 from 'd3';
import { Box, BoxSize, Boxes, Scales, scaleDistance } from './scales';
import { attrd, getSize } from './utils';
import { Data, makeRandomRawData, getDataItem, Downsampling } from './data';


const AppName = 'hotmap';
const Class = {
    MainDiv: `${AppName}-main-div`,
    CanvasDiv: `${AppName}-canvas-div`,
    Marker: `${AppName}-marker`,
    Tooltip: `${AppName}-tooltip`,
}
const MIN_ZOOMED_DATAPOINTS = 15;


export type DataDescription<TX, TY, TItem> = {
    items: TItem[],
    x: TX[] | ((d: TItem, i: number) => TX),
    y: TY[] | ((d: TItem, i: number) => TY),
    xDomain: TX[],  // | (TX extends number ? { min: TX, max: TX } : never),
    yDomain: TY[],
}

// const DefaultColorScale = d3.scaleLinear([0, 0.5, 1], ['#2222dd', '#ffffff', '#dd2222']);
const DefaultColorScale = d3.scaleSequential(d3.interpolateOrRd);
const DefaultItemColor = '#888888';


export class Heatmap<TXLabel, TYLabel, TDataItem> {
    private data: Data<TDataItem>;
    private downsampling: TDataItem extends number ? Downsampling<TDataItem> : undefined;
    private zoomBehavior?: d3.ZoomBehavior<Element, unknown>;
    private colorScale?: (d: TDataItem) => string;

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
    static create<TX, TY, TItem>(data: DataDescription<TX, TY, TItem>): Heatmap<TX, TY, TItem>
    static create<TX, TY, TItem>(data?: DataDescription<TX, TY, TItem>): Heatmap<TX, TY, TItem> | Heatmap<number, number, number> {
        if (data !== undefined) {
            return new this(data);
        } else {
            return new this(makeRandomData(8, 20)).setColorScale(DefaultColorScale);
        }
    }

    private constructor(data: DataDescription<TXLabel, TYLabel, TDataItem>) {
        this.setData(data);
        console.log('data:', this.data);
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
            style: { position: 'relative', width: '100%', height: '100%', backgroundColor: '#eeeeff' },
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

    private setRawData(data: Data<TDataItem>): this {
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
    setData<TX, TY, TItem>(data: DataDescription<TX, TY, TItem>): Heatmap<TX, TY, TItem> {
        const { items, x, y, xDomain, yDomain } = data;
        const nColumns = xDomain.length;
        const nRows = yDomain.length;
        const array = new Array<TItem | undefined>(nColumns * nRows).fill(undefined);
        const xs = (typeof x === 'function') ? items.map(x) : x;
        const ys = (typeof y === 'function') ? items.map(y) : y;
        const xDomainIndex = new Map(xDomain.map((x, i) => [x, i])); // TODO avoid creating array of arrays
        const yDomainIndex = new Map(yDomain.map((y, i) => [y, i])); // TODO avoid creating array of arrays
        let warned = false;
        for (let i = 0; i < items.length; i++) {
            const d = items[i];
            const x = xs[i];
            const y = ys[i];
            if (!xDomainIndex.has(x)) {
                if (!warned) {
                    console.warn('Some data items map to X values out of the X domain.'); // TODO add details
                    warned = true;
                }
            } else if (!yDomainIndex.has(y)) {
                if (!warned) {
                    console.warn('Some data items map to Y values out of the Y domain.'); // TODO add details
                    warned = true;
                }
            } else {
                array[nColumns * yDomainIndex.get(y)! + xDomainIndex.get(x)!] = d;
            }
        }
        this.setRawData({ items: array, nRows, nColumns } as Data<TDataItem>);

        return this as unknown as Heatmap<TXLabel, TYLabel, TItem>;
    }
    setColorScale(scale: (d: TDataItem) => string): this {
        this.colorScale = scale;
        return this;
    }

    private getDataItem(x: number, y: number): TDataItem | undefined {
        return getDataItem(this.data, x, y);
    }
    private renderData() {
        if (!this.rootDiv) return;
        const xResolution = this.canvasDomSize.width / this.downsamplingPixelsPerRect;
        console.log('xResolution', xResolution)
        const colFrom = Math.floor(this.boxes.visWorld.xmin);
        const colTo = Math.ceil(this.boxes.visWorld.xmax); // exclusive
        const downsamplingCoefficient = Downsampling.downsamplingCoefficient(colTo - colFrom, xResolution);
        console.log('datapoints:', colTo - colFrom, 'downsamplingCoefficient:', downsamplingCoefficient, '->', Math.ceil((colTo - colFrom) / downsamplingCoefficient))
        console.time('downsampling')
        const downsampled = this.downsampling ? Downsampling.getDownsampled(this.downsampling, downsamplingCoefficient) : this.data;
        console.timeEnd('downsampling')
        return this.renderTheseData(downsampled, downsamplingCoefficient);
        // return this.renderTheseData(this.data, downsamplingCoefficient);
    }
    private renderTheseData(data: Data<TDataItem>, scale: number) {
        if (!this.rootDiv) return;
        console.time('renderData');
        // this.ctx.resetTransform(); this.ctx.scale(scale, 1);
        this.ctx.clearRect(0, 0, this.canvasInnerSize.width, this.canvasInnerSize.height);
        const width = scaleDistance(this.scales.worldToCanvas.x, 1) * scale;
        const height = scaleDistance(this.scales.worldToCanvas.y, 1);
        const xGap = scale === 1 ? Math.min(scaleDistance(this.scales.domToCanvas.x, 1), 0.1 * width) : 0; // 1px on screen or 10% of the rect width
        const yGap = scaleDistance(this.scales.domToCanvas.y, 1); // 1px on screen
        const colFrom = Math.floor(this.boxes.visWorld.xmin / scale);
        const colTo = Math.ceil(this.boxes.visWorld.xmax / scale); // exclusive
        // console.log('col from', colFrom, 'to', colTo, 'scale', scale);

        for (let row = 0; row < data.nRows; row++) {
            for (let col = colFrom; col < colTo; col++) {
                const item = getDataItem(data, col, row);
                if (item === undefined) continue;
                this.ctx.fillStyle = this.scaleColor(item);
                const x = this.scales.worldToCanvas.x(col * scale);
                const y = this.scales.worldToCanvas.y(row);
                this.ctx.fillRect(x + xGap, y + yGap, width - 2 * xGap, height - 2 * yGap);
            }
        }
        console.timeEnd('renderData');
    }

    private scaleColor(item: TDataItem): string {
        if (this.colorScale) return this.colorScale(item);
        return DefaultItemColor;
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

    private handleHover(event: MouseEvent | undefined) {
        if (!event) {
            // on mouseleave or when cursor is not at any data point
            this.svg.selectAll('.' + Class.Marker).remove();
            this.mainDiv.selectAll('.' + Class.Tooltip).remove();
            return;
        }
        // console.log('mousemove', e)
        const x = Math.floor(this.scales.domToWorld.x(event.offsetX));
        const y = Math.floor(this.scales.domToWorld.y(event.offsetY));
        const dataItem = this.getDataItem(x, y);
        if (!dataItem) {
            this.handleHover(undefined);
            return;
        }

        const marker = this.svg.selectAll('.' + Class.Marker).data([1]);
        const variableAttrs = {
            width: scaleDistance(this.scales.worldToDom.x, 1),
            height: scaleDistance(this.scales.worldToDom.y, 1),
            x: this.scales.worldToDom.x(x),
            y: this.scales.worldToDom.y(y),
        };
        attrd(marker.enter().append('rect'), {
            class: Class.Marker,
            stroke: 'black',
            strokeWidth: 2,
            fill: 'none',
            ...variableAttrs,
        });
        attrd(marker, variableAttrs);

        const tooltip = this.mainDiv.selectAll('.' + Class.Tooltip).data([1]);
        const tooltipLeft = `${(event.clientX ?? 0) + 5}px`;
        const tooltipBottom = `${document.documentElement.clientHeight - (event.clientY ?? 0) + 5}px`;
        const tooltipText = `x-index: ${x}<br>y-index: ${y}<br>item: ${formatDataItem(dataItem)}`;
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

    private readonly handlers = {
        mousemove: (e: any) => this.handleHover(e),
        mouseleave: (e: any) => this.handleHover(undefined),
        wheel: (e: any) => {
            e.preventDefault();
            // Interpret horizontal scroll (and vertical with Shift key) as panning
            if (!this.zoomBehavior) return;
            const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
            const translation = isHorizontal ? e.deltaX : e.shiftKey ? e.deltaY : 0;
            if (translation !== 0) {
                const shift = scaleDistance(this.scales.domToWorld.x, -translation);
                this.zoomBehavior.translateBy(this.svg as any, shift, 0);
            }
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

function formatDataItem(item: any): string {
    if (typeof item === 'number') return item.toFixed(3);
    if (typeof item === 'object') return JSON.stringify(item);
    return `${item}`;
}