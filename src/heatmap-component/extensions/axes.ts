import { Class } from '../class-names';
import * as d3 from '../d3-modules';
import { Domain } from '../data/domain';
import { BehaviorBase, Extension } from '../extension';
import { shallowMerge } from '../utils';


/** Parameters for `AxesExtension` */
export interface AxesExtensionParams<TX, TY> {
    /** Options for the top X axis (`false` to hide the axis, `true` to show with default options). */
    top: boolean | Partial<AxisOptions<TX>>;
    /** Options for the bottom X axis (`false` to hide the axis, `true` to show with default options). */
    bottom: boolean | Partial<AxisOptions<TX>>;
    /** Options for the left Y axis (`false` to hide the axis, `true` to show with default options). */
    left: boolean | Partial<AxisOptions<TY>>;
    /** Options for the right Y axis (`false` to hide the axis, `true` to show with default options). */
    right: boolean | Partial<AxisOptions<TY>>;
}

/** Default parameter values for `AxesExtension` */
export const DefaultAxesExtensionParams: AxesExtensionParams<unknown, unknown> = {
    top: false,
    bottom: false,
    left: false,
    right: false,
};


export interface AxisOptions<TDomain> {
    /** Pixel offset between the axis and the heatmap canvas. */
    offset: number,
    /** Function that returns the arguments used to generate axis ticks. These arguments will be passed to the D3 `Axis.tickArguments` method and to the `tickValues` and `tickFormat` functions. */
    tickArguments: (scale: d3.ScaleLinear<number, number>, domain: Domain<TDomain>) => [count?: number, specifier?: string],
    /** Function that returns the list of tick values, or `null` to use the D3 default ticks. */
    tickValues: (scale: d3.ScaleLinear<number, number>, domain: Domain<TDomain>, tickArguments: [count?: number, specifier?: string]) => Iterable<d3.NumberValue> | null,
    /** Function that returns the tick formatter, or `null` to use the D3 default formatter. */
    tickFormat: (scale: d3.ScaleLinear<number, number>, domain: Domain<TDomain>, tickArguments: [count?: number, specifier?: string]) => ((index: d3.NumberValue, i: number) => string) | null,
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

function normalizeAxisOptions<TDomain>(param: boolean | Partial<AxisOptions<TDomain>>): AxisOptions<TDomain> | undefined {
    if (!param) return undefined;
    if (param === true) return DefaultAxisOptions;
    return shallowMerge(DefaultAxisOptions, param);
}


/** Behavior class for `AxesExtension` (displays axes around the heatmap canvas) */
export class AxesBehavior<TX, TY> extends BehaviorBase<AxesExtensionParams<TX, TY>, TX, TY> {
    override register(): void {
        super.register();
        this.subscribe(this.state.events.render, () => this.updateAxes());
        this.subscribe(this.state.events.resize, () => this.updateAxes());
        this.subscribe(this.state.events.zoom, () => this.updateAxes());
        this.subscribe(this.state.events.data, () => this.updateAxes());
    }

    override update(params: Partial<AxesExtensionParams<TX, TY>>): void {
        super.update(params);
        this.updateAxes();
    }

    override unregister(): void {
        this.state.dom?.mainDiv.selectAll(`.${Class.Axes}`).remove();
        super.unregister();
    }

    private updateAxes(): void {
        if (!this.state.dom) return;

        // Get measurements
        const mainRect = getInnerRect(this.state.dom.mainDiv.node());
        const canvasRect = getInnerRect(this.state.dom.canvasDiv.node());
        if (!mainRect || !canvasRect) return;
        const canvasLeft = canvasRect.left - mainRect.left;
        const canvasTop = canvasRect.top - mainRect.top;

        // Create/update axes SVG
        const currentAxesSvg = this.state.dom.mainDiv.selectAll<SVGSVGElement, unknown>(`.${Class.Axes}`).data([undefined]);
        const axesSvg = currentAxesSvg.enter().append('svg').attr('class', Class.Axes).merge(currentAxesSvg);

        // Create/update/remove individual axes
        const updateAxis = <TDomain>(position: 'top' | 'bottom' | 'left' | 'right', axisParam: boolean | Partial<AxisOptions<TDomain>>, domain: Domain<TDomain>) => {
            const options = normalizeAxisOptions(axisParam);
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
        };

        updateAxis('top', this.params.top, this.state.xDomain);
        updateAxis('bottom', this.params.bottom, this.state.xDomain);
        updateAxis('left', this.params.left, this.state.yDomain);
        updateAxis('right', this.params.right, this.state.yDomain);
    }

}


/** Get client rectangle of the HTML element, excluding the border */
function getInnerRect(element: HTMLElement | null) {
    if (!element) return undefined;
    const boundingRect = element.getBoundingClientRect();
    return {
        top: boundingRect.top + element.clientTop,
        height: element.clientHeight,
        left: boundingRect.left + element.clientLeft,
        width: element.clientWidth,
    };
}

function alignScale(scale: d3.ScaleLinear<number, number>, alignment: 'left' | 'center' | 'right' | 'top' | 'bottom'): d3.ScaleLinear<number, number> {
    if (alignment === 'left' || alignment === 'top') return scale;
    const origDomain = scale.domain();
    const offset = alignment === 'center' ? 0.5 : 1;
    return scale.copy().domain([origDomain[0] - offset, origDomain[1] - offset]);
}

function setAxisTicks<TDomain>(axis: d3.Axis<d3.NumberValue>, axisOptions: AxisOptions<TDomain>, scale: d3.ScaleLinear<number, number>, domain: Domain<TDomain>): d3.Axis<d3.NumberValue> {
    const tickArguments = axisOptions.tickArguments(scale, domain);
    axis.tickArguments(tickArguments);
    const tickValues = axisOptions.tickValues(scale, domain, tickArguments);
    if (tickValues) axis.tickValues(tickValues); else axis.tickValues(null);
    const tickFormat = axisOptions.tickFormat(scale, domain, tickArguments);
    if (tickFormat) axis.tickFormat(tickFormat); else axis.tickFormat(null);
    return axis;
}


/** Adds behavior that displays axes around the heatmap. When using this extension, .heatmap-canvas-div must be accordingly positioned via CSS to create space for the axes. */
export const AxesExtension: Extension<AxesExtensionParams<any, any>, typeof DefaultAxesExtensionParams> = Extension.fromBehaviorClass({
    name: 'builtin.axes',
    defaultParams: DefaultAxesExtensionParams,
    behavior: AxesBehavior,
});
