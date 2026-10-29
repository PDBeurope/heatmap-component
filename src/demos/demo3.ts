import { ColorScale, Heatmap } from '../main';


/** Demo generating the heatmap-component logo */
export function demo3(divElementOrId: HTMLDivElement | string): void {
    const items = [
        { col: 1, row: 'A', score: 0.6 },
        { col: 1, row: 'B', score: 0.4 },
        { col: 1, row: 'C', score: -1 },
        { col: 2, row: 'B', score: 0.6 },
        { col: 3, row: 'A', score: 0.6 },
        { col: 3, row: 'B', score: 0.8 },
        { col: 3, row: 'C', score: 1 },
    ];
    const heatmap = Heatmap.create({
        xDomain: [1, 2, 3],
        yDomain: ['A', 'B', 'C'],
        data: items,
        x: d => d.col,
        y: d => d.row,
    });
    const colorScale = ColorScale.continuous([-1, 0, 1], ['#E13D3D', 'white', '#2C8C11']); // like d3.scaleLinear([-1, 0, 1], ['#E13D3D', 'white', '#2C8C11']);
    heatmap.setColor(d => colorScale(d.score));
    heatmap.setVisualParams({ xGapRelative: 0.1, yGapRelative: 0.1, xGapPixels: null, yGapPixels: null });
    heatmap.extensions.tooltip?.update({ anchor: 'sw' });
    heatmap.render(divElementOrId);
    (window as any).heatmap = heatmap;
}
