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
            setTextContent('#xfirstvisibleindex', e.xFirstVisibleIndex, 0);
            setTextContent('#xlastvisibleindex', e.xLastVisibleIndex, 0);
            setTextContent('#xfirstvisible', e.xFirstVisible, 0);
            setTextContent('#xlastvisible', e.xLastVisible, 0);
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


/** Demo showing an AlphaFold PAE matrix from real data */
export async function demo5(divElementOrId: HTMLDivElement | string): Promise<void> {
    const heatmap = Heatmap.create<string, string, InterfaceContact>();
    // heatmap.setVisualParams({ xGapRelative: 0, yGapRelative: 0 }); // Remove gaps between cells
    heatmap.setVisualParams({ xGapRelative: 0.05, yGapRelative: 0.05 }); // Decrease gaps between cells
    heatmap.setTooltip((d) => `<strong>${d.residue_1} / ${d.residue_2}</strong><hr style="margin-block:0.2em;"><strong>Bond type:</strong> ${d.bond_type}<br><strong>Frequency:</strong> ${d.frequency}`);
    // heatmap.extensions.marker?.update({ freeze: true });
    // heatmap.setBrushing({ enabled: true });
    heatmap.render(divElementOrId);
    (window as any).heatmap = heatmap;


    const allData = await fetchInterfaceData();
    if (!allData) {
        const msg = `Failed to fetch interface data.`;
        setTextContent('#error', `Error: ${msg}`);
        throw new Error(msg);
    }

    let interfaceIndex = 0;
    let filterKind = getFilterKind();

    loadInterface(heatmap, allData, interfaceIndex, filterKind);
    addClickListener('#btn-previous', 'click', () => {
        interfaceIndex--;
        if (interfaceIndex < 0) interfaceIndex = allData.length - 1;
        loadInterface(heatmap, allData, interfaceIndex, filterKind);
    });
    addClickListener('#btn-next', 'click', () => {
        interfaceIndex++;
        if (interfaceIndex >= allData.length) interfaceIndex = 0;
        loadInterface(heatmap, allData, interfaceIndex, filterKind);
    });
    addClickListener('input[name=filter]', 'change', (e) => {
        filterKind = getFilterKind();
        loadInterface(heatmap, allData, interfaceIndex, filterKind);
    });
}

function loadInterface(heatmap: Heatmap<string, string, InterfaceContact>, allData: InterfaceData[], interfaceIndex: number, filter: FilterKind) {
    const data = allData[interfaceIndex];
    const maxValue = data.data.map(d => d.frequency).reduce((a, b) => b > a ? b : a, 0);
    function prepareSequence(residues: string[]) {
        if (filter === 'filter-full') return halucinateFullSequence(residues);
        if (filter === 'filter-nogaps') return removeGaps(halucinateFullSequence(residues), residues, 10);
        if (filter === 'filter-contacts') return residues;
        throw new Error(`Unknown filter kind: ${filter}`);
    }
    const sequence1 = prepareSequence(data.residues1);
    const sequence2 = prepareSequence(data.residues2);
    // TODO: get real full sequences from somewhere
    const aspectRatio = sequence2.length / sequence1.length;

    setTextContent('#interface-number', `(${interfaceIndex + 1}/${allData.length})`);
    setTextContent('#interface-title', `Interface ${data.agg_interface_id}: ${data.component_label_1} / ${data.component_label_2}`);
    setTextContent('#row-names', `${sequence1.join(', ')}`);
    setTextContent('#column-names', `${sequence2.join(', ')}`);
    setTextContent('#max-frequency', `${maxValue}`);
    document.querySelectorAll('#app').forEach(appDiv => (appDiv as HTMLElement).style.aspectRatio = String(aspectRatio));

    heatmap.setData({
        yDomain: sequence1,
        xDomain: sequence2,
        data: data.data,
        y: d => d.residue_1,
        x: d => d.residue_2,
    });
    const colorScale = ColorScale.continuous('Greens', [0, maxValue], [0.1, 1]); // [0.1, 1] is to skip the first 10% of the color palette to avoid almost-white colors
    heatmap.setColor(d => colorScale(d.frequency));
}

interface InterfaceContact {
    residue_1: string,
    residue_2: string,
    bond_type: string,
    frequency: number,
}
interface InterfaceData {
    agg_interface_id: string,
    component_label_1: string,
    component_label_2: string,
    residues1: string[],
    residues2: string[],
    data: InterfaceContact[],
}
async function fetchInterfaceData(): Promise<InterfaceData[]> {
    const url = './demo5-data/interface-data.json';
    if (!url) return [];
    const response = await fetch(url);
    if (!response.ok) return [];
    const js = await response.json();
    return js.map((interfac: any, i: number) => {
        const contacts = interfac.contact_summary;
        const residues1 = sortedUniqueResidues(contacts.map((c: any) => c.residue_1));
        const residues2 = sortedUniqueResidues(contacts.map((c: any) => c.residue_2));
        return {
            agg_interface_id: interfac.agg_interface_id,
            component_label_1: interfac.component_label_1,
            component_label_2: interfac.component_label_2,
            residues1,
            residues2,
            data: contacts,
        } satisfies InterfaceData;
    });
}

const RE_RESIDUE_NAME = /[A-Z]*(\d+)/;
function getResidueNumber(resName: string) {
    const resNum = resName.match(RE_RESIDUE_NAME)?.[1];
    return Number(resNum ?? '-1');
}
function sortedUniqueResidues(resNames: string[]): string[] {
    return Array.from(new Set(resNames)).sort((a, b) => getResidueNumber(a) - getResidueNumber(b));
}
function halucinateFullSequence(resNames: string[]) {
    const resNums = resNames.map(getResidueNumber);
    const resNumSet = new Set(resNums);
    const min = Math.min(1, ...resNums);
    const max = Math.max(1, ...resNums);
    const out = resNames.slice();
    for (let i = min; i <= max; i++) {
        if (!resNumSet.has(i)) {
            out.push(`${i}`);
        }
    }
    return sortedUniqueResidues(out);
}

function removeGaps(fullSequence: string[], present: string[], maxGap: number) {
    const n = fullSequence.length;
    const presentSet = new Set(present);
    const presentMask = fullSequence.map(item => presentSet.has(item));
    const dilatedMask = presentMask.map(() => false);
    const radius = Math.ceil(maxGap / 2);
    for (let i = 0; i < n; i++) {
        if (presentMask[i]) {
            const jFrom = Math.max(0, i - radius);
            const jTo = Math.min(n - 1, i + radius);
            for (let j = jFrom; j <= jTo; j++) dilatedMask[j] = true;
        }
    }
    return fullSequence.filter((item, i) => dilatedMask[i]);
}

/** Set text content to all HTML elements selected by `elementSelector`.
 * Example: `setTextContent('#element-to-change', 'changed text here');` */
function setTextContent(elementSelector: string, content: unknown, numberPrecision: number = 4): void {
    const elements = document.querySelectorAll(elementSelector);
    if (typeof content === 'number' && numberPrecision >= 0) content = content.toFixed(numberPrecision);
    elements.forEach(element => element.textContent = `${content}`);
}

function addClickListener(elementSelector: string, type: string, listener: EventListener): void {
    const elements = document.querySelectorAll(elementSelector);
    elements.forEach(element => element.addEventListener(type, listener));
}
type FilterKind = 'filter-full' | 'filter-nogaps' | 'filter-contacts';
function getFilterKind(): FilterKind {
    for (const elem of document.querySelectorAll('input[name=filter]:checked')) {
        return elem.getAttribute('id') as FilterKind;
    }
    throw new Error('Could not find filter kind');
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
