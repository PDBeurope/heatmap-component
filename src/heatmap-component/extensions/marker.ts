import { Class } from '../class-names';
import { BehaviorBase, Extension } from '../extension';
import { Box, scaleDistance } from '../scales';
import { attrd } from '../utils';


/** Parameters for `MarkerExtension` */
export interface MarkerExtensionParams {
    /** Radius for rounding the corners of the marker rectangle */
    markerCornerRadius: number, // rx and ry are attributes, not CSS properties, therefore cannot be changed via CSS
    /** Ignore mouse events (useful when markers are managed programmaticaly) */
    freeze: boolean,
}

/** Default parameter values for `MarkerExtension` */
export const DefaultMarkerExtensionParams: MarkerExtensionParams = {
    markerCornerRadius: 1,
    freeze: false,
};

/** Behavior class for `MarkerExtension` (highlights hovered grid cell and column and row) */
export class MarkerBehavior extends BehaviorBase<MarkerExtensionParams> {
    private readonly currentlyMarked: { xIndex: number | undefined, yIndex: number | undefined } = { xIndex: undefined, yIndex: undefined };

    override register(): void {
        super.register();
        this.subscribe(this.state.events.hover, pointed => {
            if (!this.params.freeze) {
                const hasDatum = pointed.cell?.datum !== undefined;
                this.drawMarkers(hasDatum ? pointed.cell : undefined);
            }
        });
        this.subscribe(this.state.events.resize, () => {
            this.drawMarkers(this.currentlyMarked);
        });
        this.subscribe(this.state.events.zoom, () => {
            this.drawMarkers(this.currentlyMarked);
        });
    }

    /** Add markers or update position of existing markers, to highlight the `pointed` grid cell.
     * Remove existing markers, if `pointed` is `undefined`. */
    drawMarkers(pointed: { xIndex?: number, yIndex?: number, x?: unknown, y?: unknown } | undefined): void {
        if (!this.state.dom) return;
        const xIndex = (pointed?.xIndex !== undefined) ? pointed.xIndex : this.state.xDomain.index.get(pointed?.x);
        const yIndex = (pointed?.yIndex !== undefined) ? pointed.yIndex : this.state.yDomain.index.get(pointed?.y);
        this.currentlyMarked.xIndex = xIndex;
        this.currentlyMarked.yIndex = yIndex;
        const xCoord = (xIndex !== undefined) ? this.state.scales.worldToSvg.x(xIndex) : undefined;
        const yCoord = (yIndex !== undefined) ? this.state.scales.worldToSvg.y(yIndex) : undefined;
        const width = scaleDistance(this.state.scales.worldToSvg.x, 1);
        const height = scaleDistance(this.state.scales.worldToSvg.y, 1);
        const staticAttrs = { rx: this.params.markerCornerRadius, ry: this.params.markerCornerRadius };
        // Column marker
        if (xCoord !== undefined) {
            this.addOrUpdateMarker(Class.MarkerX, staticAttrs, {
                x: xCoord,
                y: this.state.boxes.svg.ymin,
                width,
                height: Box.height(this.state.boxes.svg),
            });
        } else {
            this.removeMarker(Class.MarkerX);
        }
        // Row marker
        if (yCoord !== undefined) {
            this.addOrUpdateMarker(Class.MarkerY, staticAttrs, {
                x: this.state.boxes.svg.xmin,
                y: yCoord,
                width: Box.width(this.state.boxes.svg),
                height,
            });
        } else {
            this.removeMarker(Class.MarkerY);
        }
        // Cell marker
        if (xCoord !== undefined && yCoord !== undefined) {
            this.addOrUpdateMarker(Class.Marker, staticAttrs, {
                x: xCoord, y: yCoord, width, height,
            });
        } else {
            this.removeMarker(Class.Marker);
        }
    }

    private addOrUpdateMarker(className: string, staticAttrs: Parameters<typeof attrd>[1], dynamicAttrs: Parameters<typeof attrd>[1]): void {
        if (!this.state.dom) return;
        const marker = this.state.dom.svg.selectAll('.' + className).data([1]);
        attrd(marker.enter().append('rect'), { class: className, ...staticAttrs, ...dynamicAttrs });
        attrd(marker, dynamicAttrs);
    }
    private removeMarker(className: string): void {
        if (!this.state.dom) return;
        this.state.dom.svg.selectAll('.' + className).remove();
    }
}


/** Adds behavior that highlights hovered grid cell and column and row */
export const MarkerExtension = Extension.fromBehaviorClass({
    name: 'builtin.marker',
    defaultParams: DefaultMarkerExtensionParams,
    behavior: MarkerBehavior,
});
