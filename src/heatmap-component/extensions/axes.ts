import { Class } from '../class-names';
import * as d3 from '../d3-modules';
import { Domain } from '../data/domain';
import { BehaviorBase, Extension } from '../extension';
import { shallowMerge } from '../utils';


export interface AxisOptions<TDomain> {
    // TODO: docs
    offset: number,
    tickArguments: (scale: d3.ScaleLinear<number, number>, domain: Domain<TDomain>) => [count?: number, specifier?: string],
    tickValues: (scale: d3.ScaleLinear<number, number>, domain: Domain<TDomain>, tickArguments: [count?: number, specifier?: string]) => Iterable<d3.NumberValue> | null,
    tickFormat: (scale: d3.ScaleLinear<number, number>, domain: Domain<TDomain>, tickArguments: [count?: number, specifier?: string]) => ((domainValue: d3.NumberValue, index: number) => string) | null;
}
export const DefaultAxisOptions: AxisOptions<unknown> = {
    offset: 0,
    tickArguments: () => [],
    tickValues: (scale, domain, args) => {
        const indexPresent = (idx: number) => Math.floor(idx) === idx && idx >= 0 && idx < domain.values.length;
        if (domain.isNumeric && domain.sortDirection !== 'none') {
            // Sorted numeric column/row labels
            const indexDomain = scale.domain();
            const labelDomain = indexDomain.map(idx => Domain.interpolateValue(domain as Domain<number>, idx));
            const labelScale = scale.copy().domain(labelDomain);
            const labelTicks = labelScale.ticks(args[0]);
            const indexTicks = labelTicks.map(x => Domain.interpolateIndex(domain, x)) as number[];
            return indexTicks.some(indexPresent) ? indexTicks.filter(indexPresent) : indexTicks;
        } else {
            // Unsorted column/row labels (numbers or strings)
            return scale.ticks(args[0]).filter(indexPresent);
        }
    },
    tickFormat: (scale, domain, args) => {
        const numFormat = d3.format(args[1] ?? '');
        if (domain.isNumeric && domain.sortDirection !== 'none') {
            // Sorted numeric column/row labels
            return index => {
                const x = Domain.interpolateValue(domain as Domain<number>, index.valueOf());
                return numFormat(x);
            };
        } else {
            // Unsorted column/row labels (numbers or strings)
            return index => {
                const x = domain.values[Math.round(index.valueOf())];
                if (typeof x === 'number') return numFormat(x);
                return String(x);
            };
        }
    },
};


/** Parameters for `AxesExtension` */
export interface AxesExtensionParams<TX, TY> {
    /** Whether to show the top X axis. */
    showTop: boolean | Partial<AxisOptions<TX>>;
    /** Whether to show the bottom X axis. */
    showBottom: boolean | Partial<AxisOptions<TX>>;
    /** Whether to show the left Y axis. */
    showLeft: boolean | Partial<AxisOptions<TY>>;
    /** Whether to show the right Y axis. */
    showRight: boolean | Partial<AxisOptions<TY>>;
}

/** Default parameter values for `AxesExtension` */
export const DefaultAxesExtensionParams: AxesExtensionParams<unknown, unknown> = {
    showBottom: true,
    showLeft: true,
    showTop: false,
    showRight: false,
};

function getAxisOptions<TDomain>(param: boolean | Partial<AxisOptions<TDomain>>): AxisOptions<TDomain> | undefined {
    if (!param) return undefined;
    if (param === true) return DefaultAxisOptions;
    return shallowMerge(DefaultAxisOptions, param);
}

/** Behavior class for `AxesExtension` (highlights hovered grid cell and column and row) */
export class AxesBehavior<TX, TY> extends BehaviorBase<AxesExtensionParams<TX, TY>, TX, TY> {
    override register(): void {
        super.register();
        console.log('AxesBehavior.register');
        this.subscribe(this.state.events.render, () => this.drawAxes('render'));
        this.subscribe(this.state.events.resize, () => this.drawAxes('resize'));
        this.subscribe(this.state.events.zoom, () => this.drawAxes('zoom'));
        this.subscribe(this.state.events.data, () => this.drawAxes('data'));
    }

    override update(params: Partial<AxesExtensionParams<TX, TY>>): void {
        super.update(params);
        console.log('AxesBehavior.update');
        this.drawAxes('update');
    }

    override unregister(): void {
        console.log('AxesBehavior.unregister');
        this.state.dom?.mainDiv.selectAll(`.${Class.Axes}`).remove();
        super.unregister();
    }

    private drawAxes(message: string): void {
        if (!this.state.dom) return;
        console.log('AxesBehavior.drawAxes', message);

        // Get measurements
        const mainRect = this.state.dom.mainDiv.node()?.getBoundingClientRect();
        const canvasRect = this.state.dom.canvasDiv.node()?.getBoundingClientRect();
        if (!mainRect || !canvasRect) return;
        const canvasLeft = canvasRect.left - mainRect.left;
        const canvasTop = canvasRect.top - mainRect.top;

        // Create/update axes SVG
        const axes = this.state.dom.mainDiv.selectAll<SVGSVGElement, unknown>(`.${Class.Axes}`).data([undefined]);
        const axesSvg = axes.enter().append('svg').attr('class', Class.Axes).merge(axes);

        // Create/update/remove individual axes
        const updateAxis = <TDomain>(position: 'top' | 'bottom' | 'left' | 'right', axisParam: boolean | Partial<AxisOptions<TDomain>>, domain: Domain<TDomain>) => {
            const options = getAxisOptions(axisParam);
            const className = `heatmap-axis-${position}`;
            const currentAxisGroup = axesSvg.selectAll<SVGGElement, unknown>(`.${className}`).data(options ? [undefined] : []);
            currentAxisGroup.exit().remove();
            if (options) {
                const scale = (position === 'top' || position === 'bottom') ?
                    alignScale(this.state.scales.worldToSvg.x, this.state.xAlignment)
                    : alignScale(this.state.scales.worldToSvg.y, this.state.yAlignment);
                let axis: d3.Axis<d3.NumberValue>;
                let translate: [number, number];
                switch (position) {
                    case 'top':
                        axis = d3.axisTop(scale);
                        translate = [canvasLeft, canvasTop - options.offset];
                        break;
                    case 'bottom':
                        axis = d3.axisBottom(scale);
                        translate = [canvasLeft, canvasTop + canvasRect.height + options.offset];
                        break;
                    case 'left':
                        axis = d3.axisLeft(scale);
                        translate = [canvasLeft - options.offset, canvasTop];
                        break;
                    case 'right':
                        axis = d3.axisRight(scale);
                        translate = [canvasLeft + canvasRect.width + options.offset, canvasTop];
                        break;
                }
                const axisGroup = currentAxisGroup.enter().append('g').attr('class', className).merge(currentAxisGroup).attr('transform', `translate(${translate})`);
                setAxisTicks(axis, options, scale, domain);
                axisGroup.call(axis);
            }
        }

        updateAxis('top', this.params.showTop, this.state.xDomain);
        updateAxis('bottom', this.params.showBottom, this.state.xDomain);
        updateAxis('left', this.params.showLeft, this.state.yDomain);
        updateAxis('right', this.params.showRight, this.state.yDomain);
    }

}
function alignScale(scale: d3.ScaleLinear<number, number>, alignment: 'left' | 'center' | 'right' | 'top' | 'bottom'): d3.ScaleLinear<number, number> {
    if (alignment === 'left' || alignment === 'top') return scale;
    const origDomain = scale.domain();
    const offset = alignment === 'center' ? 0.5 : 1;
    return scale.copy().domain([origDomain[0] - offset, origDomain[1] - offset]);
}

function getTicks(length: number, alignment: 'left' | 'center' | 'right' | 'top' | 'bottom'): number[] {
    const offset = alignment === 'center' ? 0.5 : (alignment === 'right' || alignment === 'bottom') ? 1 : 0;
    return Array.from({ length }, (_, index) => index + offset);
}

function tickIndex(position: number, alignment: 'left' | 'center' | 'right' | 'top' | 'bottom'): number {
    const offset = alignment === 'center' ? 0.5 : (alignment === 'right' || alignment === 'bottom') ? 1 : 0;
    return Math.round(position - offset);
}

function setAxisTicks<TDomain>(axis: d3.Axis<d3.NumberValue>, axisParams: AxisOptions<TDomain>, scale: d3.ScaleLinear<number, number>, domain: Domain<TDomain>): d3.Axis<d3.NumberValue> {
    const tickArguments = axisParams.tickArguments(scale, domain);
    axis.tickArguments(tickArguments);
    const tickValues = axisParams.tickValues(scale, domain, tickArguments);
    if (tickValues) axis.tickValues(tickValues); else axis.tickValues(null);
    const tickFormat = axisParams.tickFormat(scale, domain, tickArguments);
    if (tickFormat) axis.tickFormat(tickFormat); else axis.tickFormat(null);
    return axis;
}


/** Adds behavior that shows axes around the heatmap. When using this extension, .heatmap-canvas-div must be accordingly positioned via CSS to create space for the axes. */
export const AxesExtension: Extension<AxesExtensionParams<any, any>, typeof DefaultAxesExtensionParams> = Extension.fromBehaviorClass({
    name: 'builtin.axes',
    defaultParams: DefaultAxesExtensionParams,
    behavior: AxesBehavior,
});
