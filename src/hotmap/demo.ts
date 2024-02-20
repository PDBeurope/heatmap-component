import * as d3 from 'd3';
import { Heatmap, formatDataItem } from './heatmap';


export function demo(divElementOrId: HTMLDivElement | string) {
    const hm = Heatmap.create();  // Heatmap<number, number, number>
    hm.render(divElementOrId);
}

export function demo2(divElementOrId: HTMLDivElement | string) {
    const items = [
        { col: 1, row: 'A', score: 0.0 },
        { col: 1, row: 'B', score: 0.2 },
        { col: 1, row: 'C', score: 0.4 },

        { col: 2, row: 'A', score: 0.6 },
        { col: 2, row: 'B', score: 0.8 },
        { col: 2, row: 'C', score: 1.0 },

        { col: 3, row: 'A', score: 0.3 },
        { col: 3, row: 'C', score: 0.7 },

        { col: 4, row: 'B', score: 0.5 },
    ];

    // Creating a heatmap with 4 columns (1, 2, 3, 4) and 3 rows (A, B, C)
    // Heatmap<number, string, { col: number, row: string, score: number }>
    const hm = Heatmap.create({
        xDomain: [1, 2, 3, 4],
        yDomain: ['A', 'B', 'C'],
        items: items,
        x: d => d.col,
        y: d => d.row,
    });

    const colorScale = d3.scaleLinear([0, 0.5, 1], ['#eeeeee', 'gold', 'red']);
    hm.setColor(d => colorScale(d.score));
    hm.setTooltip((d, x, y, xIndex, yIndex) => `<div style="font-weight: bold; margin-bottom: 0.5em;">${formatDataItem(d)}</div>Column ${x}, Row ${y}<br>Indices [${xIndex},${yIndex}]`);

    hm.render(divElementOrId);
}

