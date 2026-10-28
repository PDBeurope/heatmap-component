import { Class } from '../class-names';
import * as d3 from '../d3-modules';
import { Domain } from '../data/domain';
import { BehaviorBase, Extension } from '../extension';
import { Box } from '../scales';
import { XAlignmentMode, YAlignmentMode } from '../state';
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
    /** Space between the axis and the heatmap canvas. Default: 0. */
    axisPadding: number,
    /** Size of inner ticks. Default: 6. */
    tickSizeInner: number,
    /** Size of outer ticks (at the ends of the domain indicator for the axis (or for each subdomain)). Default: 6.
     * Use 0 to render as a plain line without endticks. Use negative values to draw the ticks inwards.
     * Apply CSS to `.heatmap-domain` to further style or hide the domain indicator. */
    tickSizeOuter: number,
    /** Distance between tick and its label. Default: 3. */
    tickPadding: number,
    /** Function that returns the arguments used to generate axis ticks.
     * These arguments will be passed to the D3 `Axis.tickArguments` method and to the `tickValues` and `tickFormat` functions. */
    tickArguments: (params: {
        /** Full domain corresponding the axis (column/row labels) */
        domain: Domain<TDomain>,
        /** D3 scale corresponding to the visible range of the columns/rows */
        scale: d3.ScaleLinear<number, number>,
    }) => [count?: number, specifier?: string],
    /** Function that returns the list of tick values (in domain index space), or `null` to use the D3 default ticks. */
    tickValues: (params: {
        /** Full domain corresponding the axis (column/row labels) */
        domain: Domain<TDomain>,
        /** D3 scale corresponding to the visible range of the columns/rows */
        scale: d3.ScaleLinear<number, number>,
        /** Arguments returned by `tickArguments` function */
        tickArguments: [count?: number, specifier?: string],
    }) => Iterable<d3.NumberValue> | null,
    /** Function that returns the tick formatter, or `null` to use the D3 default formatter. */
    tickFormat: (params: {
        /** Full domain corresponding the axis (column/row labels) */
        domain: Domain<TDomain>,
        /** D3 scale corresponding to the visible range of the columns/rows */
        scale: d3.ScaleLinear<number, number>,
        /** Arguments returned by `tickArguments` function */
        tickArguments: [count?: number, specifier?: string],
    }) => ((index: d3.NumberValue, i: number) => string) | null,
    /** Function that returns the list of subdomain ranges to be rendered as (sub)domain indicators ("brackets").
     * Each range must be a tuple [start, end], where `start` is index of the first column/row, and `end` is index of the last (inclusive).
     * Indices can be float.
     * By default, exactly one subdomain is rendered, with range equal to the visible range of domain indices (i.e. `scale.domain()`). */
    subdomainRanges: (params: {
        /** Full domain corresponding the axis (column/row labels) */
        domain: Domain<TDomain>,
        /** D3 scale corresponding to the visible range of the columns/rows */
        scale: d3.ScaleLinear<number, number>,
    }) => [start: number, end: number][],
    /** Controls whether the subdomain indicators for the axis should extend outwards to the next cell boundary. */
    subdomainIndicatorExtend: boolean,
}

export const DefaultAxisOptions: AxisOptions<unknown> = {
    axisPadding: 0,
    tickSizeInner: 6,
    tickSizeOuter: 6,
    tickPadding: 3,
    tickArguments: () => [],
    tickValues: ({ domain, scale, tickArguments }) => {
        const count = tickArguments[0];
        const indexPresent = (idx: number) => Math.floor(idx) === idx && idx >= 0 && idx < domain.values.length;
        if (domain.isNumeric && domain.sortDirection !== 'none') {
            // Sorted numeric column/row labels
            const indexDomain = scale.domain();
            const labelDomain = indexDomain.map(idx => Domain.interpolateValue(domain as Domain<number>, idx));
            const labelScale = scale.copy().domain(labelDomain);
            const labelTicks = labelScale.ticks(count);
            const indexTicks = labelTicks.map(x => Domain.interpolateIndex(domain, x)) as number[];
            return indexTicks.some(indexPresent) ? indexTicks.filter(indexPresent) : indexTicks;
        } else {
            // Unsorted column/row labels (numbers or strings)
            return scale.ticks(count).filter(indexPresent);
        }
    },
    tickFormat: ({ domain, tickArguments }) => {
        const specifier = tickArguments[1];
        const numFormat = d3.format(specifier ?? '');
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
    subdomainRanges: ({ scale }) => [getLimits(scale.domain())],
    subdomainIndicatorExtend: false,
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
        /** Position of canvas div within main div */
        const canvasBox = Box.create(canvasLeft, canvasTop, canvasLeft + canvasRect.width, canvasTop + canvasRect.height);

        // Create/update axes SVG
        const currentAxesSvg = this.state.dom.mainDiv.selectAll<SVGSVGElement, unknown>(`.${Class.Axes}`).data([undefined]);
        const axesSvg = currentAxesSvg.enter().append('svg').attr('class', Class.Axes).merge(currentAxesSvg); // TODO: .join

        // Create/update/remove individual axes
        this.updateAxis(axesSvg, canvasBox, 'top', this.params.top, this.state.xDomain);
        this.updateAxis(axesSvg, canvasBox, 'bottom', this.params.bottom, this.state.xDomain);
        this.updateAxis(axesSvg, canvasBox, 'left', this.params.left, this.state.yDomain);
        this.updateAxis(axesSvg, canvasBox, 'right', this.params.right, this.state.yDomain);
    }


    /** Create/update/remove individual axes */
    private updateAxis<TDomain>(axesSvg: d3.Selection<SVGSVGElement, any, any, any>, canvasBox: Box, position: 'top' | 'bottom' | 'left' | 'right', axisParam: boolean | Partial<AxisOptions<TDomain>>, domain: Domain<TDomain>) {
        const options = normalizeAxisOptions(axisParam);
        const groupClass = `heatmap-axis-${position}`;
        const axisClass = `heatmap-axis`;
        const subdomainClass = `heatmap-domain`;
        if (!options) {
            axesSvg.selectAll<SVGGElement, unknown>(`.${groupClass}`).remove();
            return;
        }
        let axisFn: typeof d3.axisTop;
        let translate: [number, number];
        switch (position) {
            case 'top':
                axisFn = d3.axisTop;
                translate = [canvasBox.xmin, canvasBox.ymin - options.axisPadding];
                // translate = [canvasLeft, canvasTop - options.axisPadding];
                break;
            case 'bottom':
                axisFn = d3.axisBottom;
                translate = [canvasBox.xmin, canvasBox.ymax + options.axisPadding];
                // translate = [canvasLeft, canvasTop + canvasRect.height + options.axisPadding];
                break;
            case 'left':
                axisFn = d3.axisLeft;
                translate = [canvasBox.xmin - options.axisPadding, canvasBox.ymin];
                // translate = [canvasLeft - options.axisPadding, canvasTop];
                break;
            case 'right':
                axisFn = d3.axisRight;
                translate = [canvasBox.xmax + options.axisPadding, canvasBox.ymin];
                // translate = [canvasLeft + canvasRect.width + options.axisPadding, canvasTop];
                break;
        }
        const alignmentMode = (position === 'top' || position === 'bottom') ? this.state.xAlignment : this.state.yAlignment;
        const scale = (position === 'top' || position === 'bottom') ?
            alignScale(this.state.scales.worldToSvg.x, this.state.xAlignment)
            : alignScale(this.state.scales.worldToSvg.y, this.state.yAlignment);
        const globalRange = getLimits(scale.domain());
        const subdomainRanges: [number, number][] = options.subdomainRanges({ domain, scale: scale })
            .filter(range => range[0] <= globalRange[1] && range[1] >= globalRange[0]) // Remove subdomain ranges not overlapping with the global range
            .map(range => [Math.max(range[0], globalRange[0]), Math.min(range[1], globalRange[1])]); // Clamp subdomain ranges to the global range

        /** Group to hold all axis element for a position */
        const group = axesSvg.selectAll<SVGGElement, unknown>(`.${groupClass}`)
            .data([undefined])
            .join(enter => enter.append('g').attr('class', groupClass))
            .attr('transform', `translate(${translate})`);

        // Update D3 axis:

        /** Group for D3 axis (except .domain) */
        const axisGroup = group.selectAll<SVGGElement, unknown>(`.${axisClass}`)
            .data([undefined])
            .join(enter => enter.append('g').attr('class', axisClass));

        const axis = axisFn(scale);
        setAxisTicks(axis, options, domain, scale);
        axis.tickSizeInner(options.tickSizeInner);
        // tickSizeOuter adjusted elsewhere (subdomains rendered manually)
        axis.tickPadding(options.tickPadding);
        axisGroup.call(axis);

        // Update (sub)domain indicators:

        /** Groups for (sub)domain indicators */
        const subdomainGroups = group.selectAll<SVGPathElement, unknown>(`.${subdomainClass}`)
            .data(subdomainRanges)
            .join(enter => enter.append('path').attr('class', subdomainClass));
        const strokeWidth = getStrokeWidth(subdomainGroups);
        subdomainGroups.attr('d', (subdomainRange) => {
            const worldRange = options.subdomainIndicatorExtend ? extendRange(subdomainRange, alignmentMode) : subdomainRange;
            const svgRange = worldRange.map(scale);
            /** Gap in pixels to be inserted between range indicators of too adjacent subaxes if they are extended outwards (to avoid overlap) */
            const SUBDOMAIN_GAP = 1;
            const padding = options.subdomainIndicatorExtend ?
                0.5 * SUBDOMAIN_GAP + (options.tickSizeOuter !== 0 ? 0.5 * strokeWidth : 0)
                : 0;
            /** Magic D3 adjustment depending on devicePixelRatio */
            const offset = axis.offset();
            const start = Math.min(svgRange[0] + padding, /* avoid zero length */ svgRange[1] - 0.5 * strokeWidth) + offset;
            const end = Math.max(svgRange[1] - padding, /* avoid zero length */ svgRange[0] + 0.5 * strokeWidth) + offset;
            return rangeIndicatorPath(position, options.tickSizeOuter, start, end);
        });
        // Add tooltip
        subdomainGroups.style('pointer-events', 'auto');
        subdomainGroups.selectAll('title')
            .data(subdomainRange => [subdomainRange])
            .join(enter => enter.append('title'))
            .text(subdomainRange => {
                const tooltipStart = domain.values[Math.max(0, Math.ceil(subdomainRange[0]))];
                const tooltipEnd = domain.values[Math.min(domain.values.length - 1, Math.floor(subdomainRange[1]))];
                return `${tooltipStart} - ${tooltipEnd}`;
            });
    };
}


/** Get the first and last item of `domain`. */
function getLimits<T>(domain: T[]): [T, T] {
    return [domain[0], domain[domain.length - 1]];
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

function setAxisTicks<TDomain>(axis: d3.Axis<d3.NumberValue>, axisOptions: AxisOptions<TDomain>, domain: Domain<TDomain>, scale: d3.ScaleLinear<number, number>): d3.Axis<d3.NumberValue> {
    const tickArguments = axisOptions.tickArguments({ domain, scale: scale });
    axis.tickArguments(tickArguments);
    const tickValues = axisOptions.tickValues({ domain, scale, tickArguments });
    if (tickValues) axis.tickValues(tickValues); else axis.tickValues(null);
    const tickFormat = axisOptions.tickFormat({ domain, scale, tickArguments });
    if (tickFormat) axis.tickFormat(tickFormat); else axis.tickFormat(null);
    return axis;
}

/** Extend `range` outwards to the next cell boundary */
function extendRange(range: [number, number], alignment: XAlignmentMode | YAlignmentMode): [number, number] {
    if (alignment === 'center') {
        const start = Math.floor(range[0] + 0.5) - 0.5;
        const stop = Math.ceil(range[1] + 0.5) - 0.5;
        return [start, stop];
    }
    const start = Math.floor(range[0]);
    const stop = Math.ceil(range[1]);
    return [start, stop];
}

/** Return stroke-width style property of a selection */
function getStrokeWidth(selection: d3.Selection<any, any, any, any>): number {
    const strokeWidth = parseFloat(selection.style('stroke-width'));
    if (isNaN(strokeWidth)) return 1;
    else return strokeWidth;
}

/** Return customized path for .domain element in D3 axis */
function rangeIndicatorPath(position: 'top' | 'bottom' | 'left' | 'right', endtickLength: number, start: number, end: number) {
    const isVertical = position === 'left' || position === 'right';
    const isFlipped = position === 'left' || position === 'top';
    if (endtickLength !== 0) {
        // Render as bracket (with endticks)
        const tick = isFlipped ? -endtickLength : endtickLength;
        if (isVertical)
            return `M${tick},${start} H0 V${end} H${tick}`;
        else
            return `M${start},${tick} V0 H${end} V${tick}`;
    } else {
        // Render as line (without endticks)
        if (isVertical)
            return `M0,${start} V${end}`;
        else
            return `M${start},0 H${end}`;
    }
}


/** Adds behavior that displays axes around the heatmap. When using this extension, .heatmap-canvas-div must be accordingly positioned via CSS to create space for the axes. */
export const AxesExtension: Extension<AxesExtensionParams<any, any>, typeof DefaultAxesExtensionParams> = Extension.fromBehaviorClass({
    name: 'builtin.axes',
    defaultParams: DefaultAxesExtensionParams,
    behavior: AxesBehavior,
});
