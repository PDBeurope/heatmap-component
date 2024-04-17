import { Class } from '../class-names';
import { HotmapExtension, HotmapExtensionBase } from '../extension';
import { Box, scaleDistance } from '../scales';
import { ItemEventParam } from '../state';
import { attrd } from '../utils';


export interface MarkerExtensionParams {
    markerCornerRadius: number,
}

export const DefaultMarkerExtensionParams: MarkerExtensionParams = {
    markerCornerRadius: 1,
};

export const MarkerExtension = HotmapExtension.fromClass({
    name: 'builtin.marker',
    defaultParams: DefaultMarkerExtensionParams,
    class: class extends HotmapExtensionBase<MarkerExtensionParams> {
        register() {
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
                const staticAttrs = { rx: this.params.markerCornerRadius, ry: this.params.markerCornerRadius };
                this.addOrUpdateMarker(Class.MarkerX, staticAttrs, {
                    x,
                    y: this.state.boxes.canvas.ymin,
                    width,
                    height: Box.height(this.state.boxes.canvas),
                });
                this.addOrUpdateMarker(Class.MarkerY, staticAttrs, {
                    x: this.state.boxes.canvas.xmin,
                    y,
                    width: Box.width(this.state.boxes.canvas),
                    height,
                });
                this.addOrUpdateMarker(Class.Marker, staticAttrs, {
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
});
