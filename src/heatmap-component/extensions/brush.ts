import { clamp } from 'lodash';
import * as d3 from '../d3-modules';
import { BehaviorBase, Extension } from '../extension';


/** Parameters for `BrushExtension` */
export interface BrushExtensionParams {
    // TODO allow disabling brush (default)
}

/** Default parameter values for `BrushExtension` */
export const DefaultBrushExtensionParams: BrushExtensionParams = {
};


/** Behavior class for `BrushExtension` (highlights hovered grid cell and column and row) */
export class BrushBehavior extends BehaviorBase<BrushExtensionParams> {
    private brushBehavior?: d3.BrushBehavior<unknown>;
    /** DOM element to which the the zoom behavior is bound */
    private get targetElement() { return this.state.dom?.svg; }

    register(): void {
        super.register();
        this.subscribe(this.state.events.render, () => this.addBrushBehavior());
    }

    /** Initialize zoom behavior (also remove any existing zoom behavior) */
    private addBrushBehavior(): void {
        if (!this.targetElement) return;
        if (this.brushBehavior) {
            // Remove any old behavior
            this.brushBehavior.on('start', null);
            this.brushBehavior.on('brush', null);
            this.brushBehavior.on('end', null);
            // this.targetElement.on('.zoom', null);
            // this.targetElement.on('.customzoom', null);
            this.brushBehavior = undefined;
        }
        this.brushBehavior = d3.brush();
        // this.brushBehavior.filter(e => (e instanceof WheelEvent) ? (this.wheelAction(e).kind === 'zoom') : true);
        this.brushBehavior.on('start', event => this.handleBrushStart(event));
        this.brushBehavior.on('brush', event => this.handleBrushBrush(event));
        this.brushBehavior.on('end', event => this.handleBrushEnd(event));

        this.targetElement.call(this.brushBehavior as any);
        // this.targetElement.on('wheel.customzoom', e => this.handleWheel(e)); // Avoid calling the event 'wheel.zoom', that would conflict with zoom behavior
    }
    private handleBrushStart(event: any) {
        console.log('brush start', event)
    }
    private handleBrushBrush(event: any) {
        console.log('brush brush', event)
    }
    private handleBrushEnd(event: any) {
        if (!event.sourceEvent) return;

        if (event.selection) {
            const [[left, top], [right, bottom]] = event.selection;
            console.log('brush end', event.sourceEvent, left, right, top, bottom)

            const worldLeft = this.state.scales.canvasToWorld.x(left);
            const worldRight = this.state.scales.canvasToWorld.x(right);
            const worldTop = this.state.scales.canvasToWorld.y(top);
            const worldBottom = this.state.scales.canvasToWorld.y(bottom);

            const xFirstIndex = clamp(Math.round(worldLeft), 0, this.state.dataArray.nColumns - 1);
            const xLastIndex = clamp(Math.round(worldRight) - 1, 0, this.state.dataArray.nColumns - 1);
            const yFirstIndex = clamp(Math.round(worldTop), 0, this.state.dataArray.nRows - 1);
            const yLastIndex = clamp(Math.round(worldBottom) - 1, 0, this.state.dataArray.nRows - 1);

            const xFirst = this.state.xDomain.values[xFirstIndex];
            const xLast = this.state.xDomain.values[xLastIndex];
            const yFirst = this.state.yDomain.values[yFirstIndex];
            const yLast = this.state.yDomain.values[yLastIndex];

            // Snap selection
            this.brushBehavior?.move(this.targetElement as any, [
                [this.state.scales.worldToCanvas.x(xFirstIndex), this.state.scales.worldToCanvas.y(yFirstIndex)],
                [this.state.scales.worldToCanvas.x(xLastIndex + 1), this.state.scales.worldToCanvas.y(yLastIndex + 1)],
            ], undefined);

            this.state.events.brush.next({
                selection: {
                    xFirstIndex, xLastIndex, yFirstIndex, yLastIndex,
                    xFirst, xLast, yFirst, yLast,
                },
                sourceEvent: event,
            });
        } else {
            this.state.events.brush.next({ selection: undefined, sourceEvent: event });
        }
    }

}


/** Adds behavior that highlights hovered grid cell and column and row */
export const BrushExtension = Extension.fromBehaviorClass({
    name: 'builtin.brush',
    defaultParams: DefaultBrushExtensionParams,
    behavior: BrushBehavior,
});
