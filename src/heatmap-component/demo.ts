import { range } from 'lodash';
import { ColorScale, Heatmap } from '../main';
import { DataDescription } from './data/data-description';


/** Demo showing small data with a lot of customizations */
export function demo1(divElementOrId: HTMLDivElement | string): void {
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
    const heatmap = Heatmap.create({
        xDomain: [1, 2, 3, 4],
        yDomain: ['A', 'B', 'C'],
        data: items,
        x: d => d.col,
        y: d => d.row,
        filter: (d, x, y, xIndex, yIndex) => d.score > 0,
    });
    const colorScale = ColorScale.continuous([0, 0.5, 1], ['#eeeeee', 'gold', 'red']);
    heatmap.setColor(d => colorScale(d.score));
    heatmap.setTooltip((d, x, y, xIndex, yIndex) => `<div style="font-weight: bold; margin-bottom: 0.5em;">Score: ${d.score}</div>Column ${x}, Row ${y}<br>Indices [${xIndex},${yIndex}]`);
    setTimeout(() => heatmap.setFilter(undefined), 2000);
    heatmap.setVisualParams({ xGapPixels: 0, yGapPixels: 0 });
    heatmap.events.select.subscribe(e => {
        if (e.cell) {
            console.log('selecting', e.cell.datum, e.cell.x, e.cell.y, e.cell.xIndex, e.cell.yIndex, e.sourceEvent);
        } else {
            console.log('selecting nothing');
        }
    });
    heatmap.events.zoom.subscribe(e => {
        if (e) {
            setTextContent('#xminindex', e.xMinIndex);
            setTextContent('#xmaxindex', e.xMaxIndex);
            setTextContent('#xmin', e.xMin);
            setTextContent('#xmax', e.xMax);
        }
    });
    heatmap.setZooming({ axis: 'x' });
    heatmap.render(divElementOrId);
    (window as any).heatmap = heatmap;
}


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
    heatmap.render(divElementOrId);
    (window as any).heatmap = heatmap;
}


/** Demo showing an AlphaFold PAE matrix from real data */
export async function demo4(divElementOrId: HTMLDivElement | string): Promise<void> {
    const uniprotIdFromUrl = new URL(window.location as unknown as string).searchParams.get('uniprot-id');
    const uniprotId = uniprotIdFromUrl ?? 'P06213'; // try Q5VSL9, P06213
    setTextContent('#uniprot-id', uniprotId);
    const pae = await fetchPAEMatrix(uniprotId);
    if (!pae) {
        const msg = `Failed to fetch data for ${uniprotId}.`;
        setTextContent('#error', `Error: ${msg}`);
        throw new Error(msg);
    }
    const heatmap = Heatmap.create({
        xDomain: range(1, pae.n + 1),
        yDomain: range(1, pae.n + 1),
        data: pae.data,
        x: (d, i) => i % pae.n + 1,
        y: (d, i) => Math.floor(i / pae.n) + 1,
    });
    const colorScale = ColorScale.continuous('Greens', [0, 32], [1, 0]);
    heatmap.setColor(d => colorScale(d));
    heatmap.setTooltip((d, x, y) => `Residue ${y} \\ ${x}<br>PAE: ${d}`);
    heatmap.setVisualParams({ xGapRelative: 0, yGapRelative: 0 });
    heatmap.render(divElementOrId);
    (window as any).heatmap = heatmap;
}

async function fetchPAEMatrix(uniprotId: string) {
    const url = `https://alphafold.ebi.ac.uk/files/AF-${uniprotId}-F1-predicted_aligned_error_v4.json`;
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const js = await response.json();
    const values = js[0].predicted_aligned_error as number[][];
    return {
        n: values.length,
        data: values.flatMap(x => x),
    };
}


/** Set text content to all HTML elements selected by `elementSelector`.
 * Example: `setTextContent('#element-to-change', 'changed text here');` */
function setTextContent(elementSelector: string, content: unknown, numberPrecision: number = 4): void {
    const elements = document.querySelectorAll(elementSelector);
    if (typeof content === 'number' && numberPrecision >= 0) content = content.toFixed(numberPrecision);
    elements.forEach(element => element.textContent = `${content}`);
}
