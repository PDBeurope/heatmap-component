import { clamp } from 'lodash';
import { Class } from '../class-names';
import * as d3 from '../d3-modules';
import { BehaviorBase, Extension } from '../extension';
import { XY } from '../scales';


/** Parameters for `BrushExtension` */
export interface BrushExtensionParams {
    /** Switches brushing on/off */
    enabled: boolean,
}

/** Default parameter values for `BrushExtension` */
export const DefaultBrushExtensionParams: BrushExtensionParams = {
    enabled: false,
};


/** Behavior class for `BrushExtension` (allows selecting a rectangular region by mouse brush gesture, not compatible with zooming!) */
export class BrushBehavior extends BehaviorBase<BrushExtensionParams> {
    /** D3 brush behavior */
    private readonly brushBehavior: d3.BrushBehavior<unknown> = d3.brush()
        .on('start', event => this.handleBrushStart(event))
        .on('end', event => this.handleBrushEnd(event));

    private get svg() { return this.state.dom?.svg; }

    /** DOM element to which the brush behavior is bound */
    private targetElement?: d3.Selection<SVGGElement, any, any, any>;

    override register(): void {
        super.register();
        this.subscribe(this.state.events.render, () => {
            if (this.params.enabled) this.addBrushBehavior();
        });
    }
    override update(params: Partial<BrushExtensionParams>): void {
        super.update(params);
        if (this.params.enabled && !this.targetElement) this.addBrushBehavior();
        if (!this.params.enabled && this.targetElement) this.removeBrushBehavior();
    }
    override unregister(): void {
        this.removeBrushBehavior();
        super.unregister();
    }

    /** Bind brush behavior (also remove any existing) */
    private addBrushBehavior(): void {
        if (!this.svg) return;
        this.removeBrushBehavior();
        this.targetElement = this.svg.append('g').attr('class', 'brush-target').call(this.brushBehavior);
        d3.select(document).on('keydown.BrushExtension', event => { if (event.key === 'Escape') this.deselect(event); });
    }

    /** Remove existing brush behavior (if any) */
    private removeBrushBehavior(): void {
        if (this.targetElement) {
            if (this.state.events.brush.value.selection) {
                this.deselect();
            }
            this.targetElement.remove();
            this.targetElement = undefined;
            d3.select(document).on('keydown.BrushExtension', null);
        }
    }

    private handleBrushStart(event: any) {
        this.placeCloseIcon(undefined);
    }

    private handleBrushEnd(event: any) {
        if (!event.sourceEvent) return; // avoid infinite loop from snapping

        if (event.selection) {
            const [[left, top], [right, bottom]] = event.selection;

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
            const snapLeft = this.state.scales.worldToCanvas.x(xFirstIndex);
            const snapRight = this.state.scales.worldToCanvas.x(xLastIndex + 1);
            const snapTop = this.state.scales.worldToCanvas.y(yFirstIndex);
            const snapBottom = this.state.scales.worldToCanvas.y(yLastIndex + 1);
            this.brushBehavior.move(this.targetElement as any, [
                [snapLeft, snapTop],
                [snapRight, snapBottom],
            ], undefined);
            this.placeCloseIcon({ x: snapRight, y: snapTop });

            this.state.events.brush.next({
                selection: {
                    xFirstIndex, xLastIndex, yFirstIndex, yLastIndex,
                    xFirst, xLast, yFirst, yLast,
                },
                sourceEvent: event,
            });
        } else {
            this.placeCloseIcon(undefined);
            this.state.events.brush.next({ selection: undefined, sourceEvent: event });
        }
    }

    /** Add or remove "close" icon */
    private placeCloseIcon(canvasPosition: XY | undefined): void {
        if (!this.svg) return;
        this.svg.selectAll(`.${Class.BrushClose}`).remove();
        if (canvasPosition) {
            const group = this.svg
                .append('g')
                .classed(Class.BrushClose, true)
                .attr('transform', `translate(${canvasPosition.x} ${canvasPosition.y}) scale(${16 / 24})`)
                .on('mousemove', e => {
                    // avoid default hover behavior
                    this.state.events.hover.next({ cell: undefined, sourceEvent: e });
                    e.stopPropagation();
                })
                .on('click', e => {
                    this.deselect();
                    e.stopPropagation(); // avoid messing up with pinnable tooltips
                });
            group
                .append('circle')
                .classed('circle', true)
                .attr('cx', '0')
                .attr('cy', '0')
                .attr('r', '14');
            group
                .append('path')
                .classed('cross', true)
                .attr('d', 'M7,-5.59 L5.59,-7 L0,-1.41 L-5.59,-7 L-7,-5.59 L-1.41,0 L-7,5.59 L-5.59,7 L0,1.41 L5.59,7 L7,5.59 L1.41,0 L7,-5.59 Z');
        }
    }

    private deselect(event?: any) {
        this.brushBehavior.clear(this.targetElement as any);
        this.state.events.brush.next({ selection: undefined, sourceEvent: event });
    }
}


/** Adds behavior that highlights hovered grid cell and column and row */
export const BrushExtension = Extension.fromBehaviorClass({
    name: 'builtin.brush',
    defaultParams: DefaultBrushExtensionParams,
    behavior: BrushBehavior,
});
