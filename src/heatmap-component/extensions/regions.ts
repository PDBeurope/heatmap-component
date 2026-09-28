import { Class } from '../class-names';
import { Selection } from '../d3-modules';
import { BehaviorBase, Extension } from '../extension';
import { Box } from '../scales';


/** Parameters for `RegionsExtension` */
export interface RegionsExtensionParams {
    /** Options for the top X axis (`false` to hide the axis, `true` to show with default options). */
    xRegions: [number, number][] | null,
}

/** Default parameter values for `RegionsExtension` */
export const DefaultRegionsExtensionParams: RegionsExtensionParams = {
    xRegions: null,
};


/** Behavior class for `RegionsExtension` (marks custom regions ) */
export class RegionsBehavior extends BehaviorBase<RegionsExtensionParams> {
    override register(): void {
        super.register();
        this.subscribe(this.state.events.render, () => this.updateRegions());
        this.subscribe(this.state.events.resize, () => this.updateRegions());
        this.subscribe(this.state.events.zoom, () => this.updateRegions());
    }

    override update(params: Partial<RegionsExtensionParams>): void {
        super.update(params);
        this.updateRegions();
    }

    override unregister(): void {
        this.state.dom?.svg.selectAll(`.${Class.RegionX}`).remove();
        this.state.dom?.svg.selectAll(`.${Class.RegionY}`).remove();
        this.state.dom?.svg.selectAll(`.${Class.Region}`).remove();
        super.unregister();
    }

    private updateRegions(): void {
        if (!this.state.dom) return;
        const svg = this.state.dom.svg;
        // TODO: shortcut if no regions? (remove when emptying params)

        const xScale = this.state.scales.worldToSvg.x;

        const dataX = this.params.xRegions ?? [];

        updateRegionGroups(svg, Class.RegionX, dataX.map(d => Box.create(xScale(d[0]), this.state.boxes.svg.ymin, xScale(d[1]), this.state.boxes.svg.ymax)), 'x');
    }
}

function getOrCreateRegionGroups<TData>(svg: Selection<SVGSVGElement, any, any, any>, className: string, data: TData[]) {
    const groups = svg.selectAll<SVGGElement, unknown>(`g.${className}`).data(data);
    groups.exit().remove();
    const enterGroups = groups.enter().append('g').attr('class', className);
    enterGroups.append('rect').attr('stroke', 'none');
    enterGroups.append('path');
    return enterGroups.merge(groups);
}

function updateRegionGroups(svg: Selection<SVGSVGElement, any, any, any>, className: string, boxes: Box[], strokes: 'x' | 'y' | 'xy') {
    const gRegionsX = getOrCreateRegionGroups(svg, className, boxes);
    gRegionsX.select('rect')
        .attr('x', b => b.xmin)
        .attr('width', b => b.xmax - b.xmin)
        .attr('y', b => b.ymin)
        .attr('height', b => b.ymax - b.ymin);
    if (strokes === 'x') {
        // Draw vertical edges
        gRegionsX.select('path').attr('d', b => `M${b.xmin} ${b.ymin} L ${b.xmin} ${b.ymax} M${b.xmax} ${b.ymin} L ${b.xmax} ${b.ymax} `);
    } else {
        // TODO: implement
        throw new Error('NotImplementedError');
    }
}


/** Adds behavior that marks custom regions along the X and Y axes. */
export const RegionsExtension: Extension<RegionsExtensionParams, typeof DefaultRegionsExtensionParams> = Extension.fromBehaviorClass({
    name: 'builtin.regions',
    defaultParams: DefaultRegionsExtensionParams,
    behavior: RegionsBehavior,
});


// TODO: doublecheck performance of AxesExtension and RegionExtension (issues might be caused only dev vs prod build)
