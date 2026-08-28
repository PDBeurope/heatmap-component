import { Class } from '../class-names';
import * as d3 from '../d3-modules';
import { BehaviorBase, Extension } from '../extension';
import { attrd } from '../utils';


/** Parameters for `AxesExtension` */
export interface AxesExtensionParams {
}

/** Default parameter values for `AxesExtension` */
export const DefaultAxesExtensionParams: AxesExtensionParams = {};

/** Behavior class for `AxesExtension` (highlights hovered grid cell and column and row) */
export class AxesBehavior extends BehaviorBase<AxesExtensionParams> {
    override register(): void {
        super.register();
        this.subscribe(this.state.events.render, () => this.drawAxes('render'));
        this.subscribe(this.state.events.resize, () => this.drawAxes('resize'));
        this.subscribe(this.state.events.zoom, () => this.drawAxes('zoom'));
        this.subscribe(this.state.events.data, () => this.drawAxes('data'));
    }

    override update(params: Partial<AxesExtensionParams>): void {
        super.update(params);
        console.log('AxesBehavior.update')
        this.drawAxes('update');
    }

    private drawAxes(message: string): void {
        if (!this.state.dom) return;
        console.log('AxesBehavior.drawAxes', message)

        const mainRect = this.state.dom.mainDiv.node()?.getBoundingClientRect();
        const canvasRect = this.state.dom.canvasDiv.node()?.getBoundingClientRect();
        if (!mainRect || !canvasRect) return;
        const canvasLeft = canvasRect.left - mainRect.left;
        const canvasTop = canvasRect.top - mainRect.top;

        // Select/create axes SVG
        const axes = this.state.dom.mainDiv.selectAll<SVGSVGElement, unknown>(`.${Class.Axes}`).data([undefined]);
        const axesSvg = axes.enter().append('svg').attr('class', Class.Axes).merge(axes);

        attrd(axesSvg, {
            width: mainRect.width,
            height: mainRect.height,
            style: { position: 'absolute', left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' },
        });

        const xAxis = axesSvg.selectAll<SVGGElement, unknown>('.heatmap-axis-x').data([undefined]);
        const xGroup = xAxis.enter().append('g').attr('class', 'heatmap-axis-x').merge(xAxis)
            .attr('transform', `translate(${canvasLeft},${canvasTop + canvasRect.height})`);
        const yAxis = axesSvg.selectAll<SVGGElement, unknown>('.heatmap-axis-y').data([undefined]);
        const yGroup = yAxis.enter().append('g').attr('class', 'heatmap-axis-y').merge(yAxis)
            .attr('transform', `translate(${canvasLeft},${canvasTop})`);

        const xScale = this.state.scales.worldToSvg.x.copy().range([0, canvasRect.width]);
        const yScale = this.state.scales.worldToSvg.y.copy().range([0, canvasRect.height]);
        const xTicks = this.getTicks(this.state.xDomain.values.length, this.state.xAlignment);
        const yTicks = this.getTicks(this.state.yDomain.values.length, this.state.yAlignment);
        console.log('AxesBehavior.drawAxes calling')
        xGroup.call(d3.axisBottom(xScale).tickValues(xTicks).tickFormat(index => String(this.state.xDomain.values[this.tickIndex(Number(index), this.state.xAlignment)])) as any);
        yGroup.call(d3.axisLeft(yScale).tickValues(yTicks).tickFormat(index => String(this.state.yDomain.values[this.tickIndex(Number(index), this.state.yAlignment)])) as any);
        console.log('AxesBehavior.drawAxes called')
    }

    private getTicks(length: number, alignment: 'left' | 'center' | 'right' | 'top' | 'bottom'): number[] {
        console.log('AxesBehavior.getTicks')
        const offset = alignment === 'center' ? 0.5 : (alignment === 'right' || alignment === 'bottom') ? 1 : 0;
        return Array.from({ length }, (_, index) => index + offset);
    }

    private tickIndex(position: number, alignment: 'left' | 'center' | 'right' | 'top' | 'bottom'): number {
        const offset = alignment === 'center' ? 0.5 : (alignment === 'right' || alignment === 'bottom') ? 1 : 0;
        return Math.round(position - offset);
    }
}


/** Adds behavior that highlights hovered grid cell and column and row */
export const AxesExtension = Extension.fromBehaviorClass({
    name: 'builtin.axes',
    defaultParams: DefaultAxesExtensionParams,
    behavior: AxesBehavior,
});
