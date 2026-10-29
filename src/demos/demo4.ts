import range from 'lodash/range';
import { ColorScale, Heatmap } from '../main';


/** Demo showing an AlphaFold PAE matrix from real data */
export async function demo4(divElementOrId: HTMLDivElement | string): Promise<void> {
    const uniprotIdFromUrl = new URL(window.location as unknown as string).searchParams.get('uniprot-id');
    const uniprotId = uniprotIdFromUrl ?? 'P06213'; // try Q5VSL9, P06213
    setTextContent('#uniprot-id', uniprotId);
    const pae = await fetchPAEMatrix(uniprotId, undefined);
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
    heatmap.setTooltip(null);
    heatmap.setVisualParams({ xGapRelative: 0, yGapRelative: 0 });
    heatmap.extensions.marker?.update({ freeze: true });
    heatmap.setBrushing({ enabled: true });
    heatmap.events.brush.subscribe(e => {
        const selection = e?.selection ? `Scored residue (x): ${e.selection.xFirst}-${e.selection.xLast} / Aligned residue (y): ${e.selection.yFirst}-${e.selection.yLast}` : 'None';
        const left = e.selection ? e.selection.xMinIndex / pae.n : 0;
        const width = e.selection ? (e.selection.xMaxIndex - e.selection.xMinIndex) / pae.n : 0;
        const top = e.selection ? e.selection.yMinIndex / pae.n : 0;
        const height = e.selection ? (e.selection.yMaxIndex - e.selection.yMinIndex) / pae.n : 0;
        const color = e.type === 'end' ? '#777777' : '#aaaaaa';
        setTextContent('#selection', selection);
        document.getElementById('xindicator')?.setAttribute('style', `left: ${left * 100}%; width: ${width * 100}%; background-color: ${color};`);
        document.getElementById('yindicator')?.setAttribute('style', `top: ${top * 100}%; height: ${height * 100}%; background-color: ${color};`);
    });
    heatmap.render(divElementOrId);
    (window as any).heatmap = heatmap;
}

async function getPAEMatrixUrl(uniprotId: string) {
    const predictionUrl = `https://alphafold.ebi.ac.uk/api/prediction/${uniprotId}`;
    const response = await fetch(predictionUrl);
    if (!response.ok) return undefined;
    const js = await response.json();
    if (!js.length) throw new Error(`${predictionUrl} returned zero models`);
    return js[0].paeDocUrl;
}

async function fetchPAEMatrix(uniprotId: string, cut?: number) {
    const url = await getPAEMatrixUrl(uniprotId);
    if (!url) return undefined;
    const response = await fetch(url);
    if (!response.ok) return undefined;
    const js = await response.json();
    let values = js[0].predicted_aligned_error as number[][];
    if (cut !== undefined) {
        values = values.slice(0, cut).map(row => row.slice(0, cut));
    }
    return {
        n: values.length,
        data: flatten(values),
    };
}

/** Set text content to all HTML elements selected by `elementSelector`.
 * Example: `setTextContent('#element-to-change', 'changed text here');` */
function setTextContent(elementSelector: string, content: unknown, numberPrecision: number = 4): void {
    const elements = document.querySelectorAll(elementSelector);
    if (typeof content === 'number' && numberPrecision >= 0) content = content.toFixed(numberPrecision);
    elements.forEach(element => element.textContent = `${content}`);
}

/** Flatten a nested array. Dumb implementation, but doesn't matter, this is just a demo. Would use `flatMap` but it's not available in es2015. */
function flatten<T>(arrays: T[][]): T[] {
    const out: T[] = [];
    for (const arr of arrays) {
        for (const item of arr) {
            out.push(item);
        }
    }
    return out;
}
