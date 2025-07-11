import { clamp, isNil } from 'lodash';
import { Array2D } from '../data/array2d';
import { Color } from '../data/color';
import { Provider } from '../data/data-description';
import { Downsampler } from '../data/downsampling';
import { Image } from '../data/image';
import { BehaviorBase, Extension } from '../extension';
import { Box, scaleDistance } from '../scales';
import { Refresher, minimum } from '../utils';


const DefaultColor = Color.fromString('#888888');
const DefaultColorProvider = () => DefaultColor;


/** Parameters for `DrawExtension` */
export interface DrawExtensionParams<TX, TY, TDatum> {
    /** Function that returns color for each data cell */
    colorProvider: Provider<TX, TY, TDatum, string | Color>,
    /** Horizontal gap between neighboring columns in pixels. If both `xGapPixels` and `xGapRelative` are non-null, the smaller final gap value will be used. The margin before the first and after the last column is half of the gap between columns. */
    xGapPixels: number | null,
    /** Horizontal gap between neighboring columns relative to (column width + gap). If both `xGapPixels` and `xGapRelative` are non-null, the smaller final gap value will be used. The margin before the first and after the last column is half of the gap between columns. */
    xGapRelative: number | null,
    /** Vertical gap between neighboring rows in pixels. If both `yGapPixels` and `yGapRelative` are non-null, the smaller final gap value will be used. The margin before the first and after the last row is half of the gap between rows. */
    yGapPixels: number | null,
    /** Vertical gap between neighboring rows relative to (row height + gap). If both `yGapPixels` and `yGapRelative` are non-null, the smaller final gap value will be used. The margin before the first and after the last row is half of the gap between rows. */
    yGapRelative: number | null,
    /** Minimal size (width or height) of rectangle in pixels, when showing gaps is switched on. (Gaps are switched off for smaller sizes, to avoid Moire patterns.) */
    minRectSizeForGaps: number,
}

/** Default parameter values for `DrawExtension` */
export const DefaultDrawExtensionParams: DrawExtensionParams<unknown, unknown, unknown> = {
    colorProvider: DefaultColorProvider,
    xGapPixels: 2,
    xGapRelative: 0.1,
    yGapPixels: 2,
    yGapRelative: 0.1,
    minRectSizeForGaps: 2,
};


/** Behavior class for `DrawExtension` (draws heatmap data in the canvas element) */
export class DrawBehavior<TX, TY, TDatum> extends BehaviorBase<DrawExtensionParams<TX, TY, TDatum>> {
    /** Canvas rendering context */
    private ctx?: CanvasRenderingContext2D;
    /** Manager for downsampled images */
    private downsampler?: Downsampler<'image'>;
    /** Approximate width of a rectangle in pixels, when showing downsampled data.
     * (higher value means more responsive but lower-resolution visualization) */
    private downsamplingPixelsPerRect = 1;

    override register(): void {
        super.register();
        this.subscribe(this.state.events.render, () => {
            if (!this.state.dom) return;
            const ctx = this.state.dom.canvas.node()?.getContext('2d');
            if (ctx) {
                this.ctx = ctx;
            } else {
                throw new Error('Failed to initialize canvas');
            }
            this.state.dom.svg.on('mouseenter.DrawExtension', () => this.requestDraw()); // For cases when the browser erases canvas (bug in some Chrome versions)
        });
        this.subscribe(this.state.events.zoom, () => {
            this.requestDraw();
        });
        this.subscribe(this.state.events.resize, () => {
            this.requestDraw();
        });
        this.subscribe(this.state.events.data, () => {
            this.downsampler = undefined;
            this.requestDraw();
        });
    }
    override update(params: Partial<DrawExtensionParams<TX, TY, TDatum>>): void {
        if (params.colorProvider !== this.params.colorProvider) {
            this.downsampler = undefined;
        }
        super.update(params);
        this.requestDraw();
    }
    override unregister(): void {
        if (this.state.dom) this.state.dom.svg.on('mouseenter.DrawExtension', null);
        super.unregister();
    }

    /** Compute full heatmap image based on current data and colorProvider
     * (i.e. each pixel corresponds to one grid cell) */
    private computeFullImage(): Image {
        const image = Image.create(this.state.dataArray.nColumns, this.state.dataArray.nRows);
        for (let iy = 0; iy < this.state.dataArray.nRows; iy++) {
            for (let ix = 0; ix < this.state.dataArray.nColumns; ix++) {
                const datum = Array2D.get(this.state.dataArray, ix, iy);
                if (datum === undefined) continue; // keep transparent black
                const color = this.params.colorProvider(datum, this.state.xDomain.values[ix], this.state.yDomain.values[iy], ix, iy);
                const c = (typeof color === 'string') ? Color.fromString(color) : color;
                Image.setColor(image, ix, iy, c);
            }
        }
        return image;
    }

    /** Do not call directly! Call `requestDraw` instead to avoid browser freezing. */
    private _draw(): void {
        if (!this.state.dom) return;
        const xResolution = Box.width(this.state.boxes.canvasContext) / this.downsamplingPixelsPerRect;
        const yResolution = Box.height(this.state.boxes.canvasContext) / this.downsamplingPixelsPerRect;
        this.downsampler ??= Downsampler.fromImage(this.computeFullImage());
        const downsampledImage = Downsampler.getDownsampled(this.downsampler, {
            x: xResolution * Box.width(this.state.boxes.wholeWorld) / (Box.width(this.state.boxes.visWorld)),
            y: yResolution * Box.height(this.state.boxes.wholeWorld) / (Box.height(this.state.boxes.visWorld)),
        });
        return this.drawThisImage(downsampledImage, this.state.dataArray.nColumns / downsampledImage.nColumns, this.state.dataArray.nRows / downsampledImage.nRows);
    }
    private readonly _drawer = Refresher(() => this._draw());

    /** Request that the heatmap be drawn on the canvas. */
    requestDraw(): void {
        this._drawer.requestRefresh();
    }

    private _canvasImage?: Image;
    /** Return a clean `Image` with the size of the canvas, use cached if available. */
    private getCleanCanvasImage(): Image {
        if (!this.ctx) throw new Error('`getCanvasImage` should only be called after canvas is initialized');
        const w = Math.floor(this.ctx.canvas.width);
        const h = Math.floor(this.ctx.canvas.height);
        if (this._canvasImage && this._canvasImage.nColumns === w && this._canvasImage.nRows === h) {
            Image.clear(this._canvasImage);
        } else {
            this._canvasImage = Image.create(w, h);
        }
        return this._canvasImage;
    }

    private _canvasImageData?: ImageData;
    /** Return an `ImageData` with the size of the canvas, use cached if available (not necessarily clean). */
    private getCanvasImageData(): ImageData {
        if (!this.ctx) throw new Error('`getCanvasImageData` should only be called after canvas is initialized');
        const w = Math.floor(this.ctx.canvas.width);
        const h = Math.floor(this.ctx.canvas.height);
        if (this._canvasImageData && this._canvasImageData.width === w && this._canvasImageData.height === h) {
            return this._canvasImageData;
        } else {
            this._canvasImageData = new ImageData(w, h);
            return this._canvasImageData;
        }
    }

    private drawThisImage(image: Image, xScale: number, yScale: number): void {
        if (!this.state.dom || !this.ctx) return;
        this.resizeCanvas(); // Doing this here rather than in 'resize' event handler, to avoid flickering on resize ;)
        const rectWidth = scaleDistance(this.state.scales.worldToCanvasContext.x, 1) * xScale;
        const rectHeight = scaleDistance(this.state.scales.worldToCanvasContext.y, 1) * yScale;
        const showXGaps = Box.width(this.state.boxes.canvasContext) > this.params.minRectSizeForGaps * Box.width(this.state.boxes.visWorld);
        const showYGaps = Box.height(this.state.boxes.canvasContext) > this.params.minRectSizeForGaps * Box.height(this.state.boxes.visWorld);
        const xHalfGap = showXGaps ? 0.5 * this.getXGap(rectWidth) : 0;
        const yHalfGap = showYGaps ? 0.5 * this.getYGap(rectHeight) : 0;
        const globalOpacity =
            (showXGaps ? 1 : (1 - this.getXGap(rectWidth) / rectWidth))
            * (showYGaps ? 1 : (1 - this.getYGap(rectHeight) / rectHeight));
        this.state.dom.canvas.style('opacity', globalOpacity); // This compensates for not showing gaps by lowering opacity (when scaled)

        const colFrom = clamp(Math.floor(this.state.boxes.visWorld.xmin / xScale), 0, image.nColumns);
        const colTo = clamp(Math.ceil(this.state.boxes.visWorld.xmax / xScale), 0, image.nColumns); // exclusive
        const rowFrom = clamp(Math.floor(this.state.boxes.visWorld.ymin / yScale), 0, image.nRows);
        const rowTo = clamp(Math.ceil(this.state.boxes.visWorld.ymax / yScale), 0, image.nRows); // exclusive

        const canvasImage = this.getCleanCanvasImage();
        for (let iy = rowFrom; iy < rowTo; iy++) {
            const y = this.state.scales.worldToCanvasContext.y(iy * yScale);
            const yFrom = y + yHalfGap;
            const yTo = y + rectHeight - yHalfGap;
            for (let ix = colFrom; ix < colTo; ix++) {
                const x = this.state.scales.worldToCanvasContext.x(ix * xScale);
                const xFrom = x + xHalfGap;
                const xTo = x + rectWidth - xHalfGap;
                const color = Image.getColor(image, ix, iy);
                Image.addRect(canvasImage, xFrom, yFrom, xTo, yTo, color);
            }
        }
        const imageData = Image.toImageData(canvasImage, this.getCanvasImageData());

        this.ctx.clearRect(0, 0, Box.width(this.state.boxes.canvasContext), Box.height(this.state.boxes.canvasContext));
        this.ctx.putImageData(imageData, 0, 0);
    }

    /** Adjust the logical size of the canvas to its current DOM size */
    private resizeCanvas(): void {
        if (!this.ctx) return;
        const width = Math.floor(Box.width(this.state.boxes.canvasContext)); // Canvas context would round it down anyway
        const height = Math.floor(Box.height(this.state.boxes.canvasContext)); // Canvas context would round it down anyway
        if (this.ctx.canvas.width !== width) {
            this.ctx.canvas.width = width;
        }
        if (this.ctx.canvas.height !== height) {
            this.ctx.canvas.height = height;
        }
    }

    /** Return horizontal gap between rectangles, in canvas pixels */
    private getXGap(colWidthOnCanvas: number): number {
        const gap1 = isNil(this.params.xGapPixels) ? undefined : this.params.xGapPixels;
        const gap2 = isNil(this.params.xGapRelative) ? undefined : this.params.xGapRelative * colWidthOnCanvas;
        return clamp(minimum(gap1, gap2) ?? 0, 0, colWidthOnCanvas);
    }
    /** Return vertical gap between rectangles, in canvas pixels */
    private getYGap(rowHeightOnCanvas: number): number {
        const gap1 = isNil(this.params.yGapPixels) ? undefined : this.params.yGapPixels;
        const gap2 = isNil(this.params.yGapRelative) ? undefined : this.params.yGapRelative * rowHeightOnCanvas;
        return clamp(minimum(gap1, gap2) ?? 0, 0, rowHeightOnCanvas);
    }
}


/** Adds behavior that draws heatmap data in the canvas element (uses downsampling when the heatmap is zoomed out, to achieve efficient rendering). */
export const DrawExtension: Extension<DrawExtensionParams<never, never, never>, typeof DefaultDrawExtensionParams> = Extension.fromBehaviorClass({
    name: 'builtin.draw',
    defaultParams: DefaultDrawExtensionParams,
    behavior: DrawBehavior,
});
