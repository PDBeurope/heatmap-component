import { Class } from '../class-names';
import { HeatmapExtension, HeatmapBehaviorBase } from '../extension';
import { Box, scaleDistance } from '../scales';
import { attrd } from '../utils';


export interface MarkerExtensionParams {
    markerCornerRadius: number,
}

export const DefaultMarkerExtensionParams: MarkerExtensionParams = {
    markerCornerRadius: 1,
};

export class MarkerBehavior extends HeatmapBehaviorBase<MarkerExtensionParams> {
    register() {
        super.register();
        this.subscribe(this.state.events.hover, pointed => {
            this.drawMarkers(pointed);
        });
    }

    drawMarkers(pointed: { xIndex?: number, yIndex?: number, x?: unknown, y?: unknown } | undefined) {
        if (!this.state.dom) return;
        if (pointed) {
            const xIndex = (pointed?.xIndex !== undefined) ? pointed.xIndex : this.state.xDomain.index.get(pointed?.x);
            const yIndex = (pointed?.yIndex !== undefined) ? pointed.yIndex : this.state.yDomain.index.get(pointed?.y);
            const xCoord = (xIndex !== undefined) ? this.state.scales.worldToCanvas.x(xIndex) : undefined;
            const yCoord = (yIndex !== undefined) ? this.state.scales.worldToCanvas.y(yIndex) : undefined;
            const width = scaleDistance(this.state.scales.worldToCanvas.x, 1);
            const height = scaleDistance(this.state.scales.worldToCanvas.y, 1);
            const staticAttrs = { rx: this.params.markerCornerRadius, ry: this.params.markerCornerRadius };
            // Column marker
            if (xCoord !== undefined) {
                this.addOrUpdateMarker(Class.MarkerX, staticAttrs, {
                    x: xCoord,
                    y: this.state.boxes.canvas.ymin,
                    width,
                    height: Box.height(this.state.boxes.canvas),
                });
            } else {
                this.state.dom.svg.selectAll('.' + Class.MarkerX).remove();
            }
            // Row marker
            if (yCoord !== undefined) {
                this.addOrUpdateMarker(Class.MarkerY, staticAttrs, {
                    x: this.state.boxes.canvas.xmin,
                    y: yCoord,
                    width: Box.width(this.state.boxes.canvas),
                    height,
                });
            } else {
                this.state.dom.svg.selectAll('.' + Class.MarkerY).remove();
            }
            // Item marker
            if (xCoord !== undefined && yCoord !== undefined) {
                this.addOrUpdateMarker(Class.Marker, staticAttrs, {
                    x: xCoord, y: yCoord, width, height,
                });
            } else {
                this.state.dom.svg.selectAll('.' + Class.Marker).remove();
            }
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


export const MarkerExtension = HeatmapExtension.fromClass({
    name: 'builtin.marker',
    defaultParams: DefaultMarkerExtensionParams,
    behavior: MarkerBehavior,
});
