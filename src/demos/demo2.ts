import { ColorScale, Heatmap } from '../main';
import { DataDescription } from '../heatmap-component/data/data-description';


/** Demo showing a big data example (200_000 x 20) */
export function demo2(divElementOrId: HTMLDivElement | string): void {
    const data = DataDescription.createDummy(2e5, 20);
    const heatmap = Heatmap.create(data); // Heatmap<number, number, number>
    heatmap.setVisualParams({ xGapRelative: 0, yGapRelative: 0 });
    heatmap.setColor(ColorScale.continuous('Magma', [0, 1]));
    heatmap.render(divElementOrId);
    heatmap.setZooming({ axis: 'x' });
    (window as any).heatmap = heatmap;
}
