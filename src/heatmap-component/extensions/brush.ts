import * as d3 from '../d3-modules';
import { BehaviorBase, Extension } from '../extension';


/** Parameters for `BrushExtension` */
export interface BrushExtensionParams {
    /** TODO docstring */
    snap: boolean,
    // TODO allow disabling brush (default)
}

/** Default parameter values for `BrushExtension` */
export const DefaultBrushExtensionParams: BrushExtensionParams = {
    snap: true,
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
    // TODO snap in `update`

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
        if (event.selection) {
            const [[left, top], [right, bottom]] = event.selection;
            console.log('brush end', event.sourceEvent, left, right, top, bottom)

            const xMinIndex = this.state.scales.canvasToWorld.x(left);
            const xMaxIndex = this.state.scales.canvasToWorld.x(right);
            const yMinIndex = this.state.scales.canvasToWorld.y(top);
            const yMaxIndex = this.state.scales.canvasToWorld.y(bottom);

            // TODO snap
            // if (this.params.snap && event.sourceEvent) { // avoid infinite loop
            //     this.brushBehavior?.move(this.targetElement as any, [
            //         [this.state.scales.worldToCanvas.x(Math.round(xMinIndex)), this.state.scales.worldToCanvas.y(Math.round(yMinIndex))],
            //         [this.state.scales.worldToCanvas.x(Math.round(xMaxIndex)), this.state.scales.worldToCanvas.y(Math.round(yMaxIndex))],
            //     ]);
            // }
            const xFirstIndex = Math.floor(xMinIndex);
            const xLastIndex = Math.ceil(xMaxIndex) - 1;
            const yFirstIndex = Math.floor(yMinIndex);
            const yLastIndex = Math.ceil(yMaxIndex) - 1;

            this.state.events.brush.next({ selection: { xFirstIndex, xLastIndex, yFirstIndex, yLastIndex }, sourceEvent: event });
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
