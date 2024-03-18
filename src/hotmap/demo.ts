import * as d3 from 'd3';
import { Heatmap } from './heatmap';
import { formatDataItem } from './utils';


export function demo(divElementOrId: HTMLDivElement | string) {
    const hm = Heatmap.createDummy(2e5, 20); // Heatmap<number, number, number>
    hm.setVisualParams({ xGapRelative: 0, yGapRelative: 0 });
    // hm.setVisualParams({ yGapRelative: 0 });
    // hm.setColor(Color.createScale([0, 0.5, 1], ['#00d', '#ddd', '#d00']));
    // hm.setColor(d3.scaleLinear([0, 0.5, 1], ['#00d', '#ddd', '#d00']));
    hm.render(divElementOrId);
    // hm.setFilter(d => d > 0.1);
    // setTimeout(()=> hm.setFilter(undefined), 2000);
    (window as any).hm = hm;
    // const q = resamplingCoefficients(10, 4, { from: 2.6, to: 10 });
    // for (let i = 0; i < q.from.length; i++) {
    //     console.log(q.from[i], q.to[i], q.weight[i]);
    // }
    // console.log(sum(q.weight));
    // benchmarkColor('#caffeeee', 1e7)
}

export function demo2(divElementOrId: HTMLDivElement | string) {
    // for (const arr of [[], [1], [1, 1], [1, 2], [1, 0], [1, 1, 2], [1, 1, 0],
    // [1,2,3],[1,5,9,45,120],[1,2,3,5,4,6,7], [7,6,5,4,3,2,1]]) {
    //     console.log('sort', sortDirection(arr), arr)
    // } // TODO: move this to tests
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
    hm.setFilter((d, x, y, xIndex, yIndex) => d.score > 0);
    setTimeout(() => hm.setFilter(undefined), 2000);
    // setTimeout(() => hm.setData({
    //     xDomain: [1, 2, 0, 3, 4],
    //     yDomain: ['C', 'B', 'A'],
    //     items: items,
    //     x: d => d.col,
    //     y: d => d.row,
    // }), 3000);
    hm.setVisualParams({ xGapPixels: 0, yGapPixels: 0 });
    // hm.events.resize.subscribe(e => {
    //     if (!e) {
    //         console.log('resizing nothing');
    //     } else {
    //         console.log('resizing', e);
    //     }
    // });
    // hm.events.hover.subscribe(e => {
    //     if (!e) {
    //         console.log('hovering nothing');
    //     } else {
    //         console.log('hovering', e.datum, e.x, e.y, e.xIndex, e.yIndex, e.sourceEvent);
    //     }
    // });
    // hm.events.click.subscribe(e => {
    //     if (!e) {
    //         console.log('clicking nothing');
    //     } else {
    //         console.log('clicking', e.datum, e.x, e.y, e.xIndex, e.yIndex, e.sourceEvent);
    //     }
    // });
    // hm.events.zoom.subscribe(e => {
    //     if (!e) {
    //         console.log('zooming nothing');
    //     } else {
    //         console.log('zooming', e.xMinIndex, e.xMaxIndex, 'values', e.xMin, e.xMax, e);
    //         d3.select('#xminindex').text(e.xMinIndex);
    //         d3.select('#xmaxindex').text(e.xMaxIndex);
    //         d3.select('#xmin').text(e.xMin);
    //         d3.select('#xmax').text(e.xMax);
    //     }
    // });
    hm.render(divElementOrId);
    (window as any).hm = hm;
}


