import * as d3 from 'd3';
import { Heatmap } from './heatmap';


export function demo(divElementOrId: HTMLDivElement | string) {
    const hm1 = Heatmap.create();
    const data = [
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
    const hm2 = Heatmap.create({
        xDomain: [1, 2, 3, 4],
        yDomain: ['A', 'B', 'C'],
        items: data,
        x: d => d.col,
        y: d => d.row,
    });
    const colorScale = d3.scaleLinear([0, 0.5, 1], ['white', 'yellow', 'red']);
    hm2.setColorScale(d => colorScale(d.score));
    hm2.render(divElementOrId);
}

