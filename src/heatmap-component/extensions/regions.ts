import { Class } from '../class-names';
import { Selection } from '../d3-modules';
import { BehaviorBase, Extension } from '../extension';
import { Box } from '../scales';


/** Parameters for `RegionsExtension` */
export interface RegionsExtensionParams {
    /** Regions (bands) along the X axis, expressed as `[xStart, xStop)` tuples. The values are 0-based column indices, not column names. Final index (`xStop`) is exclusive. */
    xRegions: [xStart: number, xStop: number][] | null,
    /** Regions (bands) along the Y axis, expressed as `[yStart, yStop)` tuples. The values are 0-based row indices, not row names. Final index (`yStop`) is exclusive. */
    yRegions: [yStart: number, yStop: number][] | null,
    /** Regions (rectangles) along X and Y axis, expressed as `[xStart, xStop, yStart, yStop)` 4-tuples. The values are 0-based column/row indices, not column/row names. Final index (`xStop`, `yStop`) is exclusive. */
    xyRegions: [xStart: number, xStop: number, yStart: number, yStop: number][] | null,
}

/** Default parameter values for `RegionsExtension` */
export const DefaultRegionsExtensionParams: RegionsExtensionParams = {
    xRegions: null,
    yRegions: null,
    xyRegions: null,
};


/** Behavior class for `RegionsExtension` (marks custom regions) */
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
        this.clearRegions();
        super.unregister();
    }

    private updateRegions(): void {
        if (!this.state.dom) return;

        const { xRegions, yRegions, xyRegions } = this.params;
        if (!xRegions && !yRegions && !xyRegions) { // Shortcut just for performance
            if (this.regionsVisible) {
                this.clearRegions();
            }
            return;
        }

        this.regionsVisible = true;
        const xScale = this.state.scales.worldToSvg.x;
        const yScale = this.state.scales.worldToSvg.y;
        const svgBox = this.state.boxes.svg;
        const svg = this.state.dom.svg;

        updateRegionGroups(svg, Class.RegionX, xRegions?.map(d => Box.create(xScale(d[0]), svgBox.ymin, xScale(d[1]), svgBox.ymax)), 'x');
        updateRegionGroups(svg, Class.RegionY, yRegions?.map(d => Box.create(svgBox.xmin, yScale(d[0]), svgBox.xmax, yScale(d[1]))), 'y');
        updateRegionGroups(svg, Class.RegionXY, xyRegions?.map(d => Box.create(xScale(d[0]), yScale(d[2]), xScale(d[1]), yScale(d[3]))), 'xy');
    }

    private clearRegions(): void {
        this.regionsVisible = false;
        this.state.dom?.svg.selectAll(`.${Class.RegionX}`).remove();
        this.state.dom?.svg.selectAll(`.${Class.RegionY}`).remove();
        this.state.dom?.svg.selectAll(`.${Class.RegionXY}`).remove();
    }

    private regionsVisible = false;
}

function getOrCreateRegionGroups<TData>(svg: Selection<SVGSVGElement, any, any, any>, className: string, data: TData[] | undefined) {
    const groups = svg.selectAll<SVGGElement, unknown>(`g.${className}`).data(data ?? []);
    groups.exit().remove();
    const enterGroups = groups.enter().append('g').attr('class', className);
    enterGroups.append('rect').attr('stroke', 'none');
    enterGroups.append('path');
    return enterGroups.merge(groups);
}

function updateRegionGroups(svg: Selection<SVGSVGElement, any, any, any>, className: string, boxes: Box[] | undefined, strokes: 'x' | 'y' | 'xy') {
    const gRegionsX = getOrCreateRegionGroups(svg, className, boxes);
    gRegionsX.select('rect')
        .attr('x', b => b.xmin)
        .attr('width', b => b.xmax - b.xmin)
        .attr('y', b => b.ymin)
        .attr('height', b => b.ymax - b.ymin);
    if (strokes === 'x') {
        // Draw vertical edges
        gRegionsX.select('path').attr('d', b => `M${b.xmin} ${b.ymin} L ${b.xmin} ${b.ymax} M${b.xmax} ${b.ymin} L ${b.xmax} ${b.ymax} `);
    } else if (strokes === 'y') {
        // Draw horizontal edges
        gRegionsX.select('path').attr('d', b => `M${b.xmin} ${b.ymin} L ${b.xmax} ${b.ymin} M${b.xmin} ${b.ymax} L ${b.xmax} ${b.ymax} `);
    } else {
        // Draw vertical and horizontal edges
        gRegionsX.select('path').attr('d', b => `M${b.xmin} ${b.ymin} L ${b.xmin} ${b.ymax} M${b.xmax} ${b.ymin} L ${b.xmax} ${b.ymax} M${b.xmin} ${b.ymin} L ${b.xmax} ${b.ymin} M${b.xmin} ${b.ymax} L ${b.xmax} ${b.ymax} `);
    }
}


/** Adds behavior that marks custom regions along the X and Y axes. */
export const RegionsExtension: Extension<RegionsExtensionParams, typeof DefaultRegionsExtensionParams> = Extension.fromBehaviorClass({
    name: 'builtin.regions',
    defaultParams: DefaultRegionsExtensionParams,
    behavior: RegionsBehavior,
});
