import { Class, ItemEventParam, Provider } from '../heatmap';
import { Box } from '../scales';
import { attrd, formatDataItem } from '../utils';
import { HotmapExtension, HotmapExtensionBase } from './extension';


function DefaultTooltipProvider(dataItem: unknown, x: unknown, y: unknown, xIndex: number, yIndex: number): string {
    return `x index: ${xIndex}<br>y index: ${yIndex}<br>x value: ${x}<br>y value: ${y}<br>item: ${formatDataItem(dataItem)}`;
}


/** Parameters for `TooltipExtension`. Contravariant on `TX`, `TY`, `TItem`.  */
export interface TooltipExtensionParams<TX, TY, TItem> {
    tooltipProvider: Provider<TX, TY, TItem, string> | null;
    pinnable: boolean,
}

export const DefaultTooltipExtensionParams: TooltipExtensionParams<unknown, unknown, unknown> = {
    tooltipProvider: DefaultTooltipProvider,
    pinnable: true,
};

// TODO html vs text mode?

export const TooltipExtension: HotmapExtension<TooltipExtensionParams<never, never, never>, typeof DefaultTooltipExtensionParams>
    = HotmapExtension.fromClass({
        name: 'builtin.tooltip',
        defaultParams: DefaultTooltipExtensionParams,
        class: class <TX, TY, TItem> extends HotmapExtensionBase<TooltipExtensionParams<TX, TY, TItem>, TX, TY, TItem> {
            register() {
                super.register();
                console.log('TooltipExtension', this.params)
                this.subscribe(this.state.events.hover, pointed => {
                    this.drawTooltip(pointed);
                });
                this.addPinnedTooltipBehavior();
            }
            // update(params: TooltipExtensionParams<TX, TY, TItem>) {
            //     console.log('Updating Blabla')
            //     super.update(params);
            // }
            // unregister() {
            //     console.log('Unregistering Blabla')
            //     super.unregister();
            // }

            private drawTooltip(pointed: ItemEventParam<TX, TY, TItem>) {
                if (!this.state.dom) return;
                const thisTooltipPinned = pointed && this.state.pinnedTooltip && pointed.xIndex === Math.floor(this.state.pinnedTooltip.x) && pointed.yIndex === Math.floor(this.state.pinnedTooltip.y);
                if (pointed && !thisTooltipPinned && this.params.tooltipProvider) {
                    const tooltipPosition = this.getTooltipPosition(pointed.sourceEvent);
                    const tooltipText = this.params.tooltipProvider(pointed.datum, pointed.x, pointed.y, pointed.xIndex, pointed.yIndex);
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

            private drawPinnedTooltip(pointed: ItemEventParam<TX, TY, TItem>) {
                if (!this.state.dom) return;
                this.state.dom.canvasDiv.selectAll('.' + Class.PinnedTooltipBox).remove();
                console.log('drawPinnedTooltip', this.params)
                if (pointed && this.params.tooltipProvider && this.params.pinnable) {
                    this.state.pinnedTooltip = { x: this.state.scales.canvasToWorld.x(pointed.sourceEvent.offsetX), y: this.state.scales.canvasToWorld.y(pointed.sourceEvent.offsetY) };
                    const tooltipPosition = this.getTooltipPosition(pointed.sourceEvent);
                    const tooltipText = this.params.tooltipProvider(pointed.datum, pointed.x, pointed.y, pointed.xIndex, pointed.yIndex);

                    const tooltip = attrd(this.state.dom.canvasDiv.append('div'), {
                        class: Class.PinnedTooltipBox,
                        style: { position: 'absolute', ...tooltipPosition },
                    });

                    // Tooltip content
                    attrd(tooltip.append('div'), { class: Class.PinnedTooltipContent })
                        .html(tooltipText);

                    // Tooltip close button
                    attrd(tooltip.append('div'), { class: Class.PinnedTooltipClose })
                        .on('click', () => this.state.events.click.next(undefined))
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
                    this.drawTooltip(undefined);
                } else {
                    this.state.pinnedTooltip = undefined;
                }
            }

            private addPinnedTooltipBehavior() {
                this.state.events.click.subscribe(pointed => this.drawPinnedTooltip(pointed));
                const updatePinnedTooltipPosition = () => {
                    if (this.state.dom && this.state.pinnedTooltip) {
                        const domPosition = {
                            offsetX: this.state.scales.worldToCanvas.x(this.state.pinnedTooltip.x),
                            offsetY: this.state.scales.worldToCanvas.y(this.state.pinnedTooltip.y),
                        };
                        attrd(this.state.dom.canvasDiv.selectAll('.' + Class.PinnedTooltipBox), { style: this.getTooltipPosition(domPosition) });
                    }
                };
                this.state.events.zoom.subscribe(updatePinnedTooltipPosition);
                this.state.events.resize.subscribe(updatePinnedTooltipPosition);
            }

            /** Return tooltip position as CSS style parameters (for position:absolute within this.canvasDiv) for mouse event `e` triggered on this.svg.  */
            private getTooltipPosition(e: MouseEvent | { offsetX: number, offsetY: number }) {
                const left = `${(e.offsetX ?? 0)}px`;
                const bottom = `${Box.height(this.state.boxes.canvas) - (e.offsetY ?? 0)}px`;
                const display = Box.containsPoint(this.state.boxes.canvas, { x: e.offsetX, y: e.offsetY }) ? 'unset' : 'none';
                return { left, bottom, display };
            }

        }
    });
