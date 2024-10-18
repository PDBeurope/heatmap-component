import { Class } from '../class-names';
import * as d3 from '../d3-modules';
import { BehaviorBase, Extension } from '../extension';
import { Box, XY } from '../scales';


/** Parameters for `BrushExtension` */
export interface BrushExtensionParams {
    /** Switches brushing on/off */
    enabled: boolean,
    // TODO snap
    // TODO closeIcon
}

/** Default parameter values for `BrushExtension` */
export const DefaultBrushExtensionParams: BrushExtensionParams = {
    enabled: false,
};


/** Behavior class for `BrushExtension` (allows selecting a rectangular region by mouse brush gesture, not compatible with zooming!) */
export class BrushBehavior<TX, TY> extends BehaviorBase<BrushExtensionParams> {
    /** D3 brush behavior */
    private readonly brushBehavior: d3.BrushBehavior<unknown> = d3.brush()
        .on('start', event => this.handleBrushStart(event))
        .on('brush', event => this.handleBrushBrush(event))
        .on('end', event => this.handleBrushEnd(event));

    private get svg() { return this.state.dom?.svg; }

    /** DOM element to which the brush behavior is bound */
    private targetElement?: d3.Selection<SVGGElement, any, any, any>;

    /** Distinguish between creating a new selection and modifying an existing selection (for snapping purposes) */
    private _currentBrushAction: 'create' | 'update' | undefined;


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
        if (!event.sourceEvent) return; // avoid infinite loop
        this.placeCloseIcon(undefined);
        if (event.selection) {
            const [[left, top], [right, bottom]] = event.selection;
            this._currentBrushAction = left === right && top === bottom ? 'create' : 'update';
        }
        // TODO
    }

    private handleBrushBrush(event: any) {
        if (!event.sourceEvent) return; // avoid infinite loop
        // TODO
    }

    private handleBrushEnd(event: any) {
        if (!event.sourceEvent) return; // avoid infinite loop from snapping or deselect
        const snap = true;
        let worldBox = this.brushSelectionToWorldBox(event.selection);
        if (snap) {
            const snapStrategy = this._currentBrushAction === 'update' ? 'nearest' : 'out';
            worldBox = Box.snap(worldBox, snapStrategy, this.state.boxes.wholeWorld);
            this.brushBehavior.move(this.targetElement as any, this.worldBoxToBrushSelection(worldBox));
        }

        if (worldBox) {
            this.placeCloseIcon({
                x: this.state.scales.worldToCanvas.x(worldBox.xmax),
                y: this.state.scales.worldToCanvas.y(worldBox.ymin),
            }); // right-top corner
            this.state.events.brush.next({ type: 'end', selection: this.state.worldBoxToBoxSelection(worldBox), sourceEvent: event });
        } else {
            this.placeCloseIcon(undefined);
            this.state.events.brush.next({ type: 'end', selection: undefined, sourceEvent: event });
        }
        this._currentBrushAction = undefined;
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
        this.placeCloseIcon(undefined);
        this.state.events.brush.next({ type: 'end', selection: undefined, sourceEvent: event });
    }

    private brushSelectionToWorldBox(selection: [[number, number], [number, number]] | null | undefined): Box | undefined {
        if (!selection) return undefined;
        const [[left, top], [right, bottom]] = selection;
        const canvasToWorld = this.state.scales.canvasToWorld;
        return {
            xmin: canvasToWorld.x(left),
            xmax: canvasToWorld.x(right),
            ymin: canvasToWorld.y(top),
            ymax: canvasToWorld.y(bottom),
        };
    }
    private worldBoxToBrushSelection(worldBox: Box | null | undefined): [[number, number], [number, number]] | null {
        if (!worldBox) return null;
        const worldToCanvas = this.state.scales.worldToCanvas;
        return [
            [worldToCanvas.x(worldBox.xmin), worldToCanvas.y(worldBox.ymin)],
            [worldToCanvas.x(worldBox.xmax), worldToCanvas.y(worldBox.ymax)],
        ];
    }
}


/** Adds behavior that highlights hovered grid cell and column and row */
export const BrushExtension = Extension.fromBehaviorClass({
    name: 'builtin.brush',
    defaultParams: DefaultBrushExtensionParams,
    behavior: BrushBehavior,
});
