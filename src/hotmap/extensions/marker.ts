import { Class, ItemEventParam } from '../heatmap';
import { Box, scaleDistance } from '../scales';
import { State } from '../state';
import { attrd } from '../utils';
import { HotmapExtension, HotmapExtensionBase } from './extension';


interface MarkerExtensionParams { }

export const MarkerExtension = HotmapExtension(
    class extends HotmapExtensionBase<MarkerExtensionParams> {
        register(): void {
            super.register();
            this.subscribe(this.state.events.hover, pointed => {
                this.drawMarkers(pointed);
            });
        }

        private drawMarkers(pointed: ItemEventParam<any, any, any>) {
            if (!this.state.dom) return;
            if (pointed) {
                const x = this.state.scales.worldToCanvas.x(pointed.xIndex);
                const y = this.state.scales.worldToCanvas.y(pointed.yIndex);
                const width = scaleDistance(this.state.scales.worldToCanvas.x, 1);
                const height = scaleDistance(this.state.scales.worldToCanvas.y, 1);
                const commonAttrs = { rx: this.state.visualParams.markerCornerRadius, ry: this.state.visualParams.markerCornerRadius };
                this.addOrUpdateMarker(Class.MarkerX, commonAttrs, {
                    x,
                    y: this.state.boxes.canvas.ymin,
                    width,
                    height: Box.height(this.state.boxes.canvas),
                });
                this.addOrUpdateMarker(Class.MarkerY, commonAttrs, {
                    x: this.state.boxes.canvas.xmin,
                    y,
                    width: Box.width(this.state.boxes.canvas),
                    height,
                });
                this.addOrUpdateMarker(Class.Marker, commonAttrs, {
                    x, y, width, height
                });
            } else {
                this.state.dom.svg.selectAll('.' + Class.Marker).remove();
                this.state.dom.svg.selectAll('.' + Class.MarkerX).remove();
                this.state.dom.svg.selectAll('.' + Class.MarkerY).remove();
            }
        }

        private addOrUpdateMarker(className: string, staticAttrs: Parameters<typeof attrd>[1], dynamicAttrs: Parameters<typeof attrd>[1]) {
            if (!this.state.dom) return;
            const marker = this.state.dom.svg.selectAll('.' + className).data([1]);
            attrd(marker.enter().append('rect'), { class: className, ...staticAttrs, ...dynamicAttrs });
            attrd(marker, dynamicAttrs);
        }

    }
);
