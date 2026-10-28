import { range } from 'lodash';
import { ColorScale, Heatmap } from '../main';
import { DataDescription } from './data/data-description';
import { AxisOptions } from './extensions/axes';
import { ScaleLinear } from 'd3';


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
    heatmap.setAxes({
        left: true,
        bottom: { tickArguments: () => [undefined, '.2f'] },
    });
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


/** Demo showing interface contact residues */
export async function demo5(divElementOrId: HTMLDivElement | string): Promise<void> {
    const heatmap = Heatmap.create<ResidueNumber, ResidueNumber, InterfaceContact>();
    heatmap.setVisualParams({ xGapRelative: 0.05, yGapRelative: 0.05 }); // Decrease gaps between cells
    heatmap.setTooltip((d) => `<strong>${d.residue_1} / ${d.residue_2}</strong><hr style="margin-block:0.2em;"><strong>Bond type:</strong> ${d.bond_type}<br><strong>Frequency:</strong> ${d.frequency}`);
    heatmap.setAlignment('center', 'center');
    heatmap.render(divElementOrId);
    (window as any).heatmap = heatmap;


    const allData = await fetchInterfaceData();
    if (!allData) {
        const msg = `Failed to fetch interface data.`;
        setTextContent('#error', `Error: ${msg}`);
        throw new Error(msg);
    }

    let interfaceIndex = 0;
    let axesKind = getAxesKind();

    loadInterface(heatmap, allData, interfaceIndex, axesKind);
    addClickListener('#btn-previous', 'click', () => {
        interfaceIndex--;
        if (interfaceIndex < 0) interfaceIndex = allData.length - 1;
        loadInterface(heatmap, allData, interfaceIndex, axesKind);
    });
    addClickListener('#btn-next', 'click', () => {
        interfaceIndex++;
        if (interfaceIndex >= allData.length) interfaceIndex = 0;
        loadInterface(heatmap, allData, interfaceIndex, axesKind);
    });
    addClickListener('input[name=axes-kind]', 'change', (e) => {
        axesKind = getAxesKind();
        loadInterface(heatmap, allData, interfaceIndex, axesKind);
    });
}

function loadInterface(heatmap: Heatmap<ResidueNumber, ResidueNumber, InterfaceContact>, allData: InterfaceData[], interfaceIndex: number, axesKind: AxesKind) {
    const data = allData[interfaceIndex];
    const maxValue = data.contact_summary.map(d => d.frequency).reduce((a, b) => b > a ? b : a, 0);
    const residues1 = uniqueResidueNumbers(data.contact_summary.map(c => c.residue_1));
    const residues2 = uniqueResidueNumbers(data.contact_summary.map(c => c.residue_2));
    const dom1 = prepareDomain(residues1, axesKind);
    const dom2 = prepareDomain(residues2, axesKind);

    setTextContent('#interface-number', `(${interfaceIndex + 1}/${allData.length})`);
    setTextContent('#interface-title', `Interface ${data.agg_interface_id}: ${data.component_label_1} / ${data.component_label_2}`);
    setTextContent('#row-names', `${dom1.domain.join(', ')}`);
    setTextContent('#column-names', `${dom2.domain.join(', ')}`);
    setTextContent('#max-frequency', `${maxValue}`);

    heatmap.setData<ResidueNumber, ResidueNumber, InterfaceContact>({
        yDomain: dom1.domain,
        xDomain: dom2.domain,
        data: data.contact_summary,
        y: d => getResidueNumber(d.residue_1)!,
        x: d => getResidueNumber(d.residue_2)!,
    });
    heatmap.setRegions({
        yRegions: dom1.regionRanges,
        xRegions: dom2.regionRanges,
    });

    /** End-inclusive */
    const xSubaxisRanges: [number, number][] = dom2.subaxisRanges.map(([start, stop]) => [start, stop - 1]);
    /** End-inclusive */
    const ySubaxisRanges: [number, number][] = dom1.subaxisRanges.map(([start, stop]) => [start, stop - 1]);

    const AXIS_TICK_WIDTH = 20;
    const AXIS_TICK_HEIGHT = 12;
    const commonAxisOptions: Partial<AxisOptions<ResidueNumber>> = {
        axisPadding: 6,
        tickSizeInner: 6,
        tickSizeOuter: -3,
        tickPadding: 3,
        subaxisRangeIndicatorExtend: true,
    };

    const xTicksCache = SingleEntryCache<ScaleLinear<number, number>, Map<string, number[]>>(scaleToString, scale => computeTicks(dom2.domain, xSubaxisRanges, scale, AXIS_TICK_WIDTH));
    const yTicksCache = SingleEntryCache<ScaleLinear<number, number>, Map<string, number[]>>(scaleToString, scale => computeTicks(dom1.domain, ySubaxisRanges, scale, AXIS_TICK_HEIGHT));

    heatmap.setAxes({
        left: {
            ...commonAxisOptions,
            subaxisRanges: () => ySubaxisRanges,
            tickValues: ({ globalScale, scale }) => yTicksCache.get(globalScale).get(scale.domain().join(',')) ?? [],
        },
        bottom: {
            ...commonAxisOptions,
            subaxisRanges: () => xSubaxisRanges,
            tickValues: ({ globalScale, scale }) => xTicksCache.get(globalScale).get(scale.domain().join(',')) ?? [],
        },
    });
    // TODO: consider changing per-subaxis ticks provider to global ticks provider
    const colorScale = ColorScale.continuous('Greens', [0, maxValue], [0.1, 1]); // [0.1, 1] is to skip the first 10% of the color palette to avoid almost-white colors
    heatmap.setColor(d => colorScale(d.frequency));
    heatmap.ensureCellAspectRatio({ cellAspectRatio: 1 }); // Resize the component, so that cell aspect ratio is 1:1
}


interface SingleEntryCache<I, O> {
    get(input: I): O,
}
function SingleEntryCache<I, O>(key: (input: I) => string, compute: (input: I) => O): SingleEntryCache<I, O> {
    let lastKey: string | undefined = undefined;
    let lastValue: O | undefined = undefined;
    return {
        get: (input: I) => {
            const k = key(input);
            if (lastKey !== k) {
                lastValue = compute(input);
                lastKey = k;
            }
            return lastValue!;
        },
    };
}

function scaleToString(scale: ScaleLinear<number, number>): string {
    return `${scale.domain().join(',')}:${scale.range().join(',')}`;
};

/** Ranges end-inclusive */
function computeTicks(domain: ResidueNumber[], ranges: Ranges, scale: ScaleLinear<number, number>, minSpace: number, maxTicksPerRange: number = 7): Map<string, number[]> {
    const scaleRange = scale.range();
    const unitSpace = (scaleRange[scaleRange.length - 1] - scaleRange[0]) / (domain.length - 1);
    const minStep = minSpace / unitSpace;
    const domainIndex = new Map(domain.map((x, i) => [x, i]));
    function ticksForRange(range: [number, number]): number[] {
        const firstValue = domain[range[0]];
        const lastValue = domain[range[1]];
        const minStepHere = Math.max(minStep, (lastValue - firstValue) / maxTicksPerRange);
        const step = Math.max(1, niceTickStep(minStepHere));
        const ticks: number[] = [];
        for (let i = Math.ceil(firstValue / step); i <= lastValue / step; i++) {
            const value = i * step as ResidueNumber;
            const idx = domainIndex.get(value);
            if (idx !== undefined) ticks.push(idx);
        }
        return ticks;
    }
    const ticksForRanges = ranges.map(range => ticksForRange(range));

    // Remove trailing ticks to avoid conflicts with next range
    let nextTick = Infinity;
    const nextTickPerRange = ranges.map(() => Infinity);
    for (let i = ticksForRanges.length - 1; i >= 0; i--) {
        nextTickPerRange[i] = nextTick;
        const ticksHere = ticksForRanges[i];
        while (ticksHere.length > 0 && ticksHere[ticksHere.length - 1] > nextTick - minStep) {
            ticksHere.pop();
        }
        if (ticksHere.length > 0) {
            nextTick = ticksHere[0];
        }
    }

    // Add at least one tick per range if possible, even if it doesn't fall on a multiple of step
    let prevTick = -Infinity;
    for (let i = 0; i < ticksForRanges.length; i++) {
        const ticksHere = ticksForRanges[i];
        if (ticksHere.length === 0) {
            const idx = ranges[i][0];
            if (idx - prevTick >= minStep && nextTickPerRange[i] - idx >= minStep) {
                ticksHere.push(idx);
            }
        }
        if (ticksHere.length > 0) {
            prevTick = ticksHere[ticksHere.length - 1];
        }
    }

    return new Map(ticksForRanges.map((ticks, i) => [ranges[i].join(','), ticks]));
};

/** Return the closest "nice value" greater or equal to `minStep`, e.g. 0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50... */
function niceTickStep(minStep: number): number {
    const exponent = Math.floor(Math.log10(minStep));
    const significand = minStep / 10 ** exponent;
    if (significand <= 1) return 1 * 10 ** exponent;
    if (significand <= 2) return 2 * 10 ** exponent;
    if (significand <= 5) return 5 * 10 ** exponent;
    return 10 ** (exponent + 1);
}


/** Residue number, type alias for `number` for better static checking (avoids mixing ResidueNumbers with regular numbers) */
type ResidueNumber = number & { '@type': 'ResidueNumber' };
function ResidueNumber(num: number): ResidueNumber { return num as ResidueNumber; }

function prepareDomain(residues: ResidueNumber[], axesKind: AxesKind) {
    const fullSequence = guessFullSequence(residues);
    // TODO: get real full sequences from somewhere
    const domain =
        axesKind === 'axes-full-sequence' ? fullSequence
            : axesKind === 'axes-contact-regions' ? removeGaps(fullSequence, residues, CONTIG_MAX_GAP)
                : residues;
    const contigsInFullSequence: Ranges =
        axesKind === 'axes-full-sequence' ? [[0, fullSequence.length]]
            : axesKind === 'axes-contact-regions' ? getContiguousRegions(fullSequence, residues, CONTIG_MAX_GAP)
                : getContiguousRegions(fullSequence, residues, 0);
    const resNameToDomainIndex: { [resName: string]: number } = {};
    domain.forEach((resName, i) => resNameToDomainIndex[resName] = i);
    function rangesFromFullSequenceToDomain(ranges: Ranges): Ranges {
        return ranges.map(([start, stop]) => [resNameToDomainIndex[fullSequence[start]], resNameToDomainIndex[fullSequence[stop - 1]] + 1]);
    }
    const contigs: Ranges = rangesFromFullSequenceToDomain(contigsInFullSequence);
    const contigsWithPadding: Ranges | null = axesKind === 'axes-contact-regions' ? rangesFromFullSequenceToDomain(getContiguousRegions(fullSequence, domain, 0)) : null;
    return {
        /** List of residue numbers corresponding to rows/columns */
        domain,
        /** Ranges of indices in `domain`, corresponding to contiguous regions with data (excluding padding residues before and after) - for subaxis rendering */
        subaxisRanges: contigs,
        /** Ranges of indices in `domain`, corresponding to contiguous regions with data (including padding residues before and after) - for region rendering */
        regionRanges: contigsWithPadding,
    };
}

/** Shape of data in the example Interface API response */
interface InterfaceData {
    agg_interface_id: string,
    component_label_1: string,
    component_label_2: string,
    contact_summary: InterfaceContact[],
}

interface InterfaceContact {
    residue_1: string,
    residue_2: string,
    bond_type: string,
    frequency: number,
}

async function fetchInterfaceData(): Promise<InterfaceData[]> {
    const url = './demo5-data/interface-data.json';
    if (!url) return [];
    const response = await fetch(url);
    if (!response.ok) return [];
    return await response.json();
}

const CONTIG_EXTENSION = 2; // residues
const CONTIG_MAX_GAP = 2 * CONTIG_EXTENSION; // residues

const RE_RESIDUE_NAME = /[A-Z]*([+-]?\d+)/;
function getResidueNumber(resName: string | null | undefined) {
    const resNum = resName?.match(RE_RESIDUE_NAME)?.[1];
    if (resNum === undefined) {
        console.warn(`Invalid residue name: ${resName}. Ignoring this residue.`);
        return undefined;
    }
    return ResidueNumber(Number(resNum));
}

/** Return sorted, unique residue numbers extracted from residue names (e.g. ALA123) */
function uniqueResidueNumbers(resNames: string[]): ResidueNumber[] {
    const resNums = resNames.map(getResidueNumber).filter(num => num !== undefined);
    return Array.from(new Set(resNums)).sort((a, b) => a - b);
}

/** Try to infer the full sequence of residue numbers (assumes the sequence starts at 1 and ends at the maximum number found in `resNums`) */
function guessFullSequence(resNums: ResidueNumber[]): ResidueNumber[] {
    const min = Math.min(1, ...resNums);
    const max = Math.max(1, ...resNums);
    return range(min, max + 1) as ResidueNumber[];
}

function removeGaps<T>(fullSequence: T[], present: T[], maxGap: number): T[] {
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

/** Find contiguous regions of items in `fullSequence` which are also present in `present`, allowing gaps of at most `maxGap` missing items. */
function getContiguousRegions<T>(fullSequence: T[], present: T[], maxGap: number): Ranges {
    const n = fullSequence.length;
    const presentSet = new Set(present);
    const presentMask = fullSequence.map(item => presentSet.has(item));

    const out: Ranges = [];
    for (let i = 0; i < n; i++) {
        if (presentMask[i]) {
            if (out.length > 0 && i - out[out.length - 1][1] <= maxGap) {
                out[out.length - 1][1] = i + 1;
            } else {
                out.push([i, i + 1]);
            }
        }
    }
    return out;
}

/** Collection of non-overlapping ranges of indices. `start` is inclusive, `stop` is exclusive. */
type Ranges = [start: number, stop: number][];


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

type AxesKind = 'axes-full-sequence' | 'axes-contact-regions' | 'axes-contact-residues';

function getAxesKind(): AxesKind {
    const selectedButton = document.querySelector('input[name=axes-kind]:checked');
    if (!selectedButton) throw new Error('Could not find axes kind');
    return selectedButton.getAttribute('id') as AxesKind;
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

// TODO: split demo file
