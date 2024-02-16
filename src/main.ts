import * as d3 from 'd3';
import { Box, BoxSize, Boxes, Scales, scaleDistance } from './helpers/scales';
import { attrd, getSize } from './helpers/utils';
import { Data, DataItem, makeRandomData, getDataItem, Downsampling } from './helpers/data';


const AppName = 'hotmap';
const Class = {
    MainDiv: `${AppName}-main-div`,
    CanvasDiv: `${AppName}-canvas-div`,
    Marker: `${AppName}-marker`,
    Tooltip: `${AppName}-tooltip`,
}
const MIN_ZOOMED_DATAPOINTS = 15;


export class Hotmap {
    private readonly rootDiv: d3.Selection<HTMLDivElement, any, any, any>;
    private readonly mainDiv: d3.Selection<HTMLDivElement, any, any, any>;
    private readonly canvas: d3.Selection<HTMLCanvasElement, any, any, any>;
    private readonly svg: d3.Selection<SVGSVGElement, any, any, any>;
    private readonly colorScale = d3.scaleSequential(d3.interpolateOrRd);
    // private readonly colorScale = d3.scaleLinear([0, 0.5, 1], ['blue', '#aaaaaa', 'red']);
    private readonly canvasInnerSize: BoxSize = { width: window.screen.width, height: window.screen.height }; // setting canvas size to screen size to avoid upscaling at any window size
    private readonly ctx: CanvasRenderingContext2D;
    private canvasDomSize: BoxSize;
    private boxes: Boxes;
    private scales: Scales;
    private data: Data;
    private downsampling: Downsampling;
    private zoomBehavior?: d3.ZoomBehavior<Element, unknown>;
    /** Approximate width of a rectangle in pixels, when showing downsampled data.
     * (higher value means more responsive but shittier visualization)
     * TODO try setting this dynamically, based on rendering times */
    private downsamplingPixelsPerRect = 4;

    static create(elementOrId: string | HTMLDivElement) {
        return new this(elementOrId);
    }

    private constructor(elementOrId: string | HTMLDivElement) {
        console.time('Hotmap constructor');
        this.rootDiv = typeof elementOrId === 'string' ? d3.select(`#${elementOrId}`) : d3.select(elementOrId);
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
        console.log('box', this.canvasDomSize);

        this.svg = attrd(canvasDiv.append('svg'), {
            style: { position: 'absolute', width: '100%', height: '100%' },
        })

        const ctx = this.canvas.node()?.getContext('2d');
        if (ctx) this.ctx = ctx;
        else throw new Error('Failed to initialize canvas');

        console.time('generate random data')
        this.data = makeRandomData(100, 20);
        console.timeEnd('generate random data')
        this.downsampling = Downsampling.create(this.data);

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

        console.timeEnd('Hotmap constructor');
    }

    remove(): void {
        if (!this.rootDiv) return;
        this.rootDiv.select('*').remove();
    }

    private getDataItem(x: number, y: number): DataItem | undefined {
        return getDataItem(this.data, x, y);
    }
    private renderData() {
        const xResolution = this.canvasDomSize.width / this.downsamplingPixelsPerRect;
        console.log('xResolution', xResolution)
        const colFrom = Math.floor(this.boxes.visWorld.xmin);
        const colTo = Math.ceil(this.boxes.visWorld.xmax); // exclusive
        const downsamplingCoefficient = Downsampling.downsamplingCoefficient(colTo - colFrom, xResolution);
        console.log('datapoints:', colTo - colFrom, 'downsamplingCoefficient:', downsamplingCoefficient, '->', Math.ceil((colTo - colFrom) / downsamplingCoefficient))
        console.time('downsampling')
        const downsampled = Downsampling.getDownsampled(this.downsampling, downsamplingCoefficient);
        console.timeEnd('downsampling')
        return this.renderTheseData(downsampled, downsamplingCoefficient);
        // return this.renderTheseData(this.data, downsamplingCoefficient);
    }
    private renderTheseData(data: Data, scale: number) {
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
                this.ctx.fillStyle = this.colorScale(item);
                const x = this.scales.worldToCanvas.x(col * scale);
                const y = this.scales.worldToCanvas.y(row);
                this.ctx.fillRect(x + xGap, y + yGap, width - 2 * xGap, height - 2 * yGap);
            }
        }
        console.timeEnd('renderData');
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
        this.svg
            .call(this.zoomBehavior as any)
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
        const tooltipText = `x: ${x}<br>y: ${y}<br>value: ${dataItem.toFixed(3)}`;
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
        // wheel: (e: any) => {
        //     console.log('wheel', e)
        //     // e.deltaX positive means touchpad-left (zoom in)
        //     // e.deltaY positive means touchpad-up (zoom out)
        //     let changed = false;
        //     if (e.deltaY) {
        //         if (e.shiftKey) {
        //             const old = this.boxes.world;
        //             const shift = 0.01 * this.scales.domToWorld.x(e.deltaY);
        //             this.boxes.world = { ...old, xmin: old.xmin - shift, xmax: old.xmax - shift };
        //             changed = true;
        //         } else {
        //             const old = this.boxes.world;
        //             const q = 1.005 ** e.deltaY;
        //             const xmid = this.scales.domToWorld.x(e.offsetX);
        //             console.log('xmid', xmid)
        //             this.boxes.world = {
        //                 ...old,
        //                 xmin: xmid + (old.xmin - xmid) * q,
        //                 xmax: xmid + (old.xmax - xmid) * q,
        //             };
        //             // TODO zoom limitations
        //             changed = true;
        //         }
        //         e.preventDefault();
        //     }
        //     if (changed) {
        //         this.scales = Scales(this.boxes);
        //         this.renderData();
        //     }
        //     console.log('world', this.boxes.world);
        // },
    } satisfies Record<string, (e: any) => any>;

}









