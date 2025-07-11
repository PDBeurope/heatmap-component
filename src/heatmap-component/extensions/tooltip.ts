import { Class } from '../class-names';
import { Provider } from '../data/data-description';
import { BehaviorBase, Extension } from '../extension';
import { Box, XY } from '../scales';
import { CellEventValue } from '../state';
import { attrd } from '../utils';


function DefaultTooltipProvider(datum: unknown, x: unknown, y: unknown, xIndex: number, yIndex: number): string {
    return `x: ${JSON.stringify(x)} (index ${xIndex}) <br> y: ${JSON.stringify(y)} (index ${yIndex}) <br> datum: ${JSON.stringify(datum)}`;
}


/** Parameters for `TooltipExtension`. Contravariant on `TX`, `TY`, `TDatum`. */
export interface TooltipExtensionParams<TX, TY, TDatum> {
    /** Function that returns tooltip content (as HTML string) for each data cell */
    tooltipProvider: Provider<TX, TY, TDatum, string> | null;
    /** Indicates if a tooltip can be "pinned",
     * i.e. when the user clicks on a cell, the tooltip will stay visible visible
     * until it is closed by close button or clicking elsewhere */
    pinnable: boolean,
}

/** Default parameter values for `TooltipExtension` */
export const DefaultTooltipExtensionParams: TooltipExtensionParams<unknown, unknown, unknown> = {
    tooltipProvider: DefaultTooltipProvider,
    pinnable: true,
};


/** Behavior class for `TooltipExtension` (shows a box with tooltip when hovering and/or clicking on a grid cell with data) */
export class TooltipBehavior<TX, TY, TDatum> extends BehaviorBase<TooltipExtensionParams<TX, TY, TDatum>, TX, TY, TDatum> {
    /** Position of the pinned tooltip, if any. In world coordinates, continuous. Use `Math.floor` to get column/row index. */
    private pinnedTooltip?: XY = undefined;

    override register(): void {
        super.register();
        this.subscribe(this.state.events.hover, pointed => this.drawTooltip(pointed));
        this.subscribe(this.state.events.select, pointed => this.drawPinnedTooltip(pointed));
        this.subscribe(this.state.events.zoom, () => this.updatePinnedTooltipPosition());
        this.subscribe(this.state.events.resize, () => this.updatePinnedTooltipPosition());
    }

    /** Add a div with tooltip or update position of existing tooltip, for the `pointed` grid cell.
     * Remove existing tooltip, if `pointed` is `undefined`. */
    private drawTooltip(pointed: CellEventValue<TX, TY, TDatum>): void {
        if (!this.state.dom) return;
        const thisTooltipPinned = pointed.cell && this.pinnedTooltip && pointed.cell.xIndex === Math.floor(this.pinnedTooltip.x) && pointed.cell.yIndex === Math.floor(this.pinnedTooltip.y);
        if ((pointed.cell?.datum !== undefined) && !thisTooltipPinned && this.params.tooltipProvider && pointed.sourceEvent) {
            const tooltipPosition = this.getTooltipPosition(pointed.sourceEvent);
            const tooltipText = this.params.tooltipProvider(pointed.cell.datum, pointed.cell.x, pointed.cell.y, pointed.cell.xIndex, pointed.cell.yIndex);
            let tooltip = this.state.dom.canvasDiv.selectAll<HTMLDivElement, any>('.' + Class.TooltipBox);
            if (tooltip.empty()) {
                // Create tooltip if doesn't exist
                tooltip = attrd(this.state.dom.canvasDiv.append('div'), {
                    class: Class.TooltipBox,
                    style: { position: 'absolute', ...tooltipPosition }
                });
                attrd(tooltip.append('div'), { class: Class.TooltipContent })
                    .html(tooltipText);
            } else {
                // Update tooltip position and content if exists
                attrd(tooltip, { style: tooltipPosition })
                    .select('.' + Class.TooltipContent)
                    .html(tooltipText);
            }
        } else {
            this.state.dom.canvasDiv.selectAll('.' + Class.TooltipBox).remove();
        }
    }

    /** Add a div with pinned tooltip or update position of existing pinned tooltip, for the `pointed` grid cell.
     * Remove existing pinned tooltip, if `pointed` is `undefined`.
     * Pinned tooltip is shown when the user selects a cell by clicking,
     * and stays visible until it is closed by close button or clicking elsewhere. */
    private drawPinnedTooltip(pointed: CellEventValue<TX, TY, TDatum>): void {
        if (!this.state.dom) return;
        this.state.dom.canvasDiv.selectAll('.' + Class.PinnedTooltipBox).remove();
        if (pointed.cell?.datum !== undefined && this.params.tooltipProvider && this.params.pinnable && pointed.sourceEvent) {
            this.pinnedTooltip = {
                x: this.state.scales.svgToWorld.x(pointed.sourceEvent.offsetX),
                y: this.state.scales.svgToWorld.y(pointed.sourceEvent.offsetY),
            };
            const tooltipPosition = this.getTooltipPosition(pointed.sourceEvent);
            const tooltipText = this.params.tooltipProvider(pointed.cell.datum, pointed.cell.x, pointed.cell.y, pointed.cell.xIndex, pointed.cell.yIndex);

            const tooltip = attrd(this.state.dom.canvasDiv.append('div'), {
                class: Class.PinnedTooltipBox,
                style: { position: 'absolute', ...tooltipPosition },
            });

            // Tooltip content
            attrd(tooltip.append('div'), { class: Class.PinnedTooltipContent })
                .html(tooltipText);

            // Tooltip close button
            attrd(tooltip.append('div'), { class: Class.PinnedTooltipClose })
                .on('click.TooltipExtension', (e: MouseEvent) => this.state.events.select.next({ cell: undefined, sourceEvent: e }))
                .append('svg')
                .attr('viewBox', '0 0 24 24')
                .attr('preserveAspectRatio', 'none')
                .append('path')
                .attr('d', 'M19,6.41 L17.59,5 L12,10.59 L6.41,5 L5,6.41 L10.59,12 L5,17.59 L6.41,19 L12,13.41 L17.59,19 L19,17.59 L13.41,12 L19,6.41 Z');

            // Tooltip pin
            attrd(tooltip.append('svg'), { class: Class.PinnedTooltipPin })
                .attr('viewBox', '0 0 100 100')
                .attr('preserveAspectRatio', 'none')
                .append('path')
                .attr('d', 'M0,100 L100,40 L60,0 Z');

            // Remove any non-pinned tooltip
            this.drawTooltip({ cell: undefined, sourceEvent: pointed.sourceEvent });
        } else {
            this.pinnedTooltip = undefined;
        }
    }

    /** Update position of existing pinned tooltip without changing content (used when zooming/resizing canvas). */
    private updatePinnedTooltipPosition(): void {
        if (this.state.dom && this.pinnedTooltip) {
            const domPosition = {
                offsetX: this.state.scales.worldToSvg.x(this.pinnedTooltip.x),
                offsetY: this.state.scales.worldToSvg.y(this.pinnedTooltip.y),
            };
            attrd(this.state.dom.canvasDiv.selectAll('.' + Class.PinnedTooltipBox), {
                style: this.getTooltipPosition(domPosition),
            });
        }
    };

    /** Return tooltip position as CSS style parameters (for position:absolute within this.canvasDiv) for mouse event `e` triggered on this.svg.  */
    private getTooltipPosition(e: MouseEvent | { offsetX: number, offsetY: number }) {
        const left = `${(e.offsetX ?? 0)}px`;
        const bottom = `${Box.height(this.state.boxes.svg) - (e.offsetY ?? 0)}px`;
        const display = Box.containsPoint(this.state.boxes.svg, { x: e.offsetX, y: e.offsetY }) ? 'unset' : 'none';
        return { left, bottom, display };
    }
}


/** Adds behavior that shows a box with tooltip when hovering and/or clicking on a grid cell with data */
export const TooltipExtension: Extension<TooltipExtensionParams<never, never, never>, typeof DefaultTooltipExtensionParams> = Extension.fromBehaviorClass({
    name: 'builtin.tooltip',
    defaultParams: DefaultTooltipExtensionParams,
    behavior: TooltipBehavior,
});
