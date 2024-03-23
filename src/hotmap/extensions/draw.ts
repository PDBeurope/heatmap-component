import { clamp, isNil } from 'lodash';
import { Color } from '../color';
import { Data, Image } from '../data';
import { Downsampler } from '../downsampling';
import { Provider } from '../heatmap';
import { Box, scaleDistance } from '../scales';
import { Refresher, minimum } from '../utils';
import { HotmapExtension, HotmapExtensionBase } from './extension';


/** Size of rectangle in pixels, when showing gaps is switched on (for smaller sizes off, to avoid Moire patterns) */
const MIN_PIXELS_PER_RECT_FOR_GAPS = 2;

const DefaultColor = Color.fromString('#888888');
export const DefaultColorProvider = () => DefaultColor;
export const DefaultNumericColorProviderFactory = (min: number, max: number) => Color.createScale('YlOrRd', [min, max]);


export interface DrawExtensionParams<TX, TY, TItem> {
    colorProvider: Provider<TX, TY, TItem, string | Color>
}

export const DefaultDrawExtensionParams: DrawExtensionParams<unknown, unknown, unknown> = {
    colorProvider: DefaultColorProvider,
};


export const DrawExtension: HotmapExtension<DrawExtensionParams<never, never, never>, typeof DefaultDrawExtensionParams> = HotmapExtension.fromClass({
    name: 'builtin.sample',
    defaultParams: DefaultDrawExtensionParams,
    class: class <TX, TY, TItem> extends HotmapExtensionBase<DrawExtensionParams<TX, TY, TItem>> {
        register() {
            super.register();
            console.log('Registering DrawExtension', this.state, this.params);
            this.state.events.draw.subscribe(() => this.requestDraw());
        }
        update(params: Partial<DrawExtensionParams<TX, TY, TItem>>) {
            const colorChange = params.colorProvider !== this.params.colorProvider;
            super.update(params);
            console.log('Updating DrawExtension with params', params, '->', this.params);
            if (colorChange) {
                this.state.downsampler = undefined;
                this.requestDraw();
            }
        }
        unregister() {
            console.log('Unregistering DrawExtension');
            super.unregister();
        }

        private getColorArray(): Image {
            // console.time('get all colors')
            const image = Image.create(this.state.data.nColumns, this.state.data.nRows);
            for (let iy = 0; iy < this.state.data.nRows; iy++) {
                for (let ix = 0; ix < this.state.data.nColumns; ix++) {
                    const item = Data.getItem(this.state.data, ix, iy);
                    if (item === undefined) continue; // keep transparent black
                    const color = this.params.colorProvider(item, this.state.xDomain.values[ix], this.state.yDomain.values[iy], ix, iy);
                    const c = (typeof color === 'string') ? Color.fromString(color) : color;
                    Color.toImage(c, image, ix, iy);
                }
            }
            // console.timeEnd('get all colors')
            return image;
        }

        private readonly drawer = Refresher(() => this._draw());
        requestDraw() {
            this.drawer.requestRefresh();
        }

        /** Do not call directly! Call `requestDraw` instead to avoid browser freezing. */
        private _draw() {
            if (!this.state.dom) return;
            const xResolution = Box.width(this.state.boxes.canvas) / this.state.downsamplingPixelsPerRect;
            const yResolution = Box.height(this.state.boxes.canvas) / this.state.downsamplingPixelsPerRect;
            this.state.downsampler ??= Downsampler.fromImage(this.getColorArray());
            // console.time('downsample')
            const downsampledImage = Downsampler.getDownsampled(this.state.downsampler, {
                x: xResolution * Box.width(this.state.boxes.wholeWorld) / (Box.width(this.state.boxes.visWorld)),
                // y: this.state.data.nRows,
                y: yResolution * Box.height(this.state.boxes.wholeWorld) / (Box.height(this.state.boxes.visWorld)),
            });
            console.log('downsampled', downsampledImage.nColumns, downsampledImage.nRows);
            // console.timeEnd('downsample')
            return this.drawThisImage(downsampledImage, this.state.data.nColumns / downsampledImage.nColumns, this.state.data.nRows / downsampledImage.nRows);
        }

        _canvasImage?: Image;
        private getCanvasImage(): Image {
            if (!this.state.ctx) throw new Error('`getCanvasImage` should only be called when canvas is initialized');
            const w = Math.floor(this.state.ctx.canvas.width);
            const h = Math.floor(this.state.ctx.canvas.height);
            if (this._canvasImage && this._canvasImage.nColumns === w && this._canvasImage.nRows === h) {
                Image.clear(this._canvasImage);
            } else {
                this._canvasImage = Image.create(w, h);
            }
            return this._canvasImage;
        }

        _canvasImageData?: ImageData;
        private getCanvasImageData(): ImageData {
            if (!this.state.ctx) throw new Error('`getCanvasImageData` should only be called when canvas is initialized');
            const w = Math.floor(this.state.ctx.canvas.width);
            const h = Math.floor(this.state.ctx.canvas.height);
            if (this._canvasImageData && this._canvasImageData.width === w && this._canvasImageData.height === h) {
                return this._canvasImageData;
            } else {
                this._canvasImageData = new ImageData(w, h);
                return this._canvasImageData;
            }
        }
        private drawThisImage(image: Image, xScale: number, yScale: number) {
            if (!this.state.ctx || !this.state.dom) return;
            // console.time(`drawThisImage`)
            const rectWidth = scaleDistance(this.state.scales.worldToCanvas.x, 1) * xScale;
            const rectHeight = scaleDistance(this.state.scales.worldToCanvas.y, 1) * yScale;
            const showXGaps = Box.width(this.state.boxes.canvas) > MIN_PIXELS_PER_RECT_FOR_GAPS * Box.width(this.state.boxes.visWorld);
            const showYGaps = Box.height(this.state.boxes.canvas) > MIN_PIXELS_PER_RECT_FOR_GAPS * Box.height(this.state.boxes.visWorld);
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

            const canvasImage = this.getCanvasImage();
            for (let iy = rowFrom; iy < rowTo; iy++) {
                const y = this.state.scales.worldToCanvas.y(iy * yScale);
                const yFrom = y + yHalfGap;
                const yTo = y + rectHeight - yHalfGap;
                for (let ix = colFrom; ix < colTo; ix++) {
                    const x = this.state.scales.worldToCanvas.x(ix * xScale);
                    const xFrom = x + xHalfGap;
                    const xTo = x + rectWidth - xHalfGap;
                    const color = Color.fromImage(image, ix, iy);
                    Image.addRect(canvasImage, xFrom, yFrom, xTo, yTo, color);
                }
            }
            const imageData = this.getCanvasImageData();
            Image.toImageData(canvasImage, imageData);
            this.state.ctx.clearRect(0, 0, Box.width(this.state.boxes.canvas), Box.height(this.state.boxes.canvas));
            this.state.ctx.putImageData(imageData, 0, 0);
            // console.timeEnd(`drawThisImage`)
        }

        /** Return horizontal gap between rectangles, in canvas pixels */
        private getXGap(colWidthOnCanvas: number): number {
            const gap1 = isNil(this.state.visualParams.xGapPixels) ? undefined : this.state.visualParams.xGapPixels;
            const gap2 = isNil(this.state.visualParams.xGapRelative) ? undefined : this.state.visualParams.xGapRelative * colWidthOnCanvas;
            return clamp(minimum(gap1, gap2) ?? 0, 0, colWidthOnCanvas);
        }
        /** Return vertical gap between rectangles, in canvas pixels */
        private getYGap(rowHeightOnCanvas: number): number {
            const gap1 = isNil(this.state.visualParams.yGapPixels) ? undefined : this.state.visualParams.yGapPixels;
            const gap2 = isNil(this.state.visualParams.yGapRelative) ? undefined : this.state.visualParams.yGapRelative * rowHeightOnCanvas;
            return clamp(minimum(gap1, gap2) ?? 0, 0, rowHeightOnCanvas);
        }

    }
});
