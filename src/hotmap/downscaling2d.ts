import { Data } from './data';
import { XY } from './scales';


/** Return resolution from which `wanted` resolution should be obtained by downscaling.
 * (This will have either X length or Y length doubled (or same as in `original` if doubled would be more that original)).
 * Return `undefined` if `wanted` is already equal to `original`. */
function downscaleSource2D(wanted: XY, original: XY): XY | undefined {
    if (wanted.x > original.x || wanted.y > original.y) {
        throw new Error('ArgumentError: Cannot downscale to higher resolution than original');
    }
    if (wanted.x === original.x && wanted.y === original.y) {
        // We already have it
        return undefined;
    }
    if (wanted.x === original.x || (wanted.y !== original.y && wanted.x > wanted.y)) {
        /* from up */
        return {
            x: wanted.x,
            y: Math.min(2 * wanted.y, original.y),
        };
    } else {
        /* from left */
        return {
            x: Math.min(2 * wanted.x, original.x),
            y: wanted.y,
        };
    }
}

export function debugPrintDownscalingRoute2D(wanted: XY, original: XY) {
    console.log(wanted);
    const src = downscaleSource2D(wanted, original);
    if (src) {
        debugPrintDownscalingRoute2D(src, original);
    }
}

type ResolutionString = `${number}x${number}`


export interface Image {
    nColumns: number,
    nRows: number,
    /** Pixels saved in 4-tuples (alpha, red*alpha, green*alpha, blue*alpha) */
    items: Uint8ClampedArray,
}

type DownsamplingMode = 'number' | 'color'
type DataType<M extends DownsamplingMode> = M extends 'color' ? Image : Data<number>

export type Downsampling2D<TMode extends DownsamplingMode = DownsamplingMode> = {
    mode: TMode,
    /** Column count of the original data */
    nColumns: number,
    /** Rows count of the original data */
    nRows: number,
    /** Downsampled version of the original data (index {nColumn}x{nRows} holds the original data) */
    downsampled: { [resolution: ResolutionString]: DataType<TMode> }
}

function resolutionString(resolution: XY): ResolutionString {
    return `${resolution.x}x${resolution.y}`;
}

export function createNumberDownsampling(data: Data<number>): Downsampling2D<'number'> {
    const result: Downsampling2D<'number'> = { mode: 'number', nColumns: data.nColumns, nRows: data.nRows, downsampled: {} };
    set(result, { x: data.nColumns, y: data.nRows }, data);
    return result;
}
export function createColorDownsampling(data: Image): Downsampling2D<'color'> {
    const result: Downsampling2D<'color'> = { mode: 'color', nColumns: data.nColumns, nRows: data.nRows, downsampled: {} };
    set(result, { x: data.nColumns, y: data.nRows }, data);
    return result;
}

function get<M extends DownsamplingMode>(downsampling: Downsampling2D<M>, resolution: XY): DataType<M> | undefined {
    return downsampling.downsampled[resolutionString(resolution)];
}
function set<M extends DownsamplingMode>(downsampling: Downsampling2D<M>, resolution: XY, value: DataType<M>): undefined {
    downsampling.downsampled[resolutionString(resolution)] = value;
}


/** Return `m`, a power of 2 or equal to `nDatapoints`, such that:
 * `nPixels <= m < 2*nPixels`  or  `m === nDatapoints < nPixels` */
function downsamplingTarget(nDatapoints: number, nPixels: number): number {
    let result = 1;
    while (result < nPixels && result < nDatapoints) {
        result = Math.min(2 * result, nDatapoints);
    }
    return result;
}


export function getDownsampledData<M extends DownsamplingMode>(downsampling: Downsampling2D<M>, minResolution: XY): DataType<M> {
    // console.log('getDownsampledData', resolutionString(minResolution))
    const targetResolution: XY = {
        x: downsamplingTarget(downsampling.nColumns, minResolution.x),
        y: downsamplingTarget(downsampling.nRows, minResolution.y),
    };
    return getOrCompute(downsampling, targetResolution);

}

function getOrCompute<M extends DownsamplingMode>(downsampling: Downsampling2D<M>, resolution: XY): DataType<M> {
    // console.log('getOrCompute', resolutionString(resolution))
    const cached = get(downsampling, resolution);
    if (cached) {
        return cached;
    } else {
        const srcResolution = downscaleSource2D(resolution, { x: downsampling.nColumns, y: downsampling.nRows });
        if (!srcResolution || srcResolution.x > downsampling.nColumns || srcResolution.y > downsampling.nRows) throw new Error('AssertionError');
        const srcData: DataType<M> = getOrCompute(downsampling, srcResolution);
        // console.time(`step ${srcResolution.x} -> ${resolution.x}`)
        const result = (downsampling.mode === 'color' ? downsampleXY_RGBA(srcData as DataType<'color'>, resolution) : downsample(srcData as DataType<'number'>, resolution)) as DataType<M>;
        // console.timeEnd(`step ${srcResolution.x} -> ${resolution.x}`)
        set(downsampling, resolution, result);
        return result;
    }
}

function downsample(data: Data<number>, targetResolution: XY): Data<number> {
    // return downsampleXY(data, targetResolution);
    const x = data.nColumns;
    const y = data.nRows;
    if (targetResolution.x === x) {
        // downsample along Y
        if (y === 2 * targetResolution.y) {
            // halve
            return downsampleXY(data, targetResolution);
        } else {
            // general downsample
            return downsampleXY(data, targetResolution);
        }
    } else if (targetResolution.y === y) {
        // downsample along X
        if (x === 2 * targetResolution.x) {
            // halve
            return halveX(data);
        } else {
            // general downsample
            return downsampleX(data, targetResolution);
        }
    } else {
        throw new Error('ValueError: Cannot downsample along X and Y axis at the same time');

    }
}


/** Up- or down-sample image to a new size. */
function downsampleXY(input: Data<number>, newSize: { x: number, y: number }): Data<number> {
    // console.log('downsampleXY')
    console.time('downsampleXY')
    const w0 = input.nColumns;
    const h0 = input.nRows;
    const w1 = newSize.x;
    const h1 = newSize.y;
    const nChannels = Math.floor(input.items.length / (h0 * w0));
    if (nChannels !== 1) throw new Error('NotImplementedError: multiple channels');
    const x = resamplingCoefficients(w0, w1);
    const y = resamplingCoefficients(h0, h1);
    const out = new Float32Array(h1 * w1 * nChannels); // Use better precision here to avoid rounding errors when summing many small numbers
    for (let i = 0; i < y.from.length; i++) { // row index
        const y_from_offset = y.from[i] * w0;
        const y_to_offset = y.to[i] * w1;
        const y_weight = y.weight[i];
        for (let j = 0; j < x.from.length; j++) { // column index
            const inputValue = input.items[y_from_offset + x.from[j]];
            if (inputValue === undefined) throw new Error('NotImplementedError: undefined values in data'); // TODO also treat NaN and Infs specially
            out[y_to_offset + x.to[j]] += inputValue * y_weight * x.weight[j];
        }
    }
    const result: Data<number> = { nColumns: w1, nRows: h1, items: out, isNumeric: true };
    console.timeEnd('downsampleXY')
    return result;
}

/* Some optimization wrt downsampleXY (assuming only X-axis downscale and 1 channel) - doesn't provide much improvement :( */
function downsampleX(input: Data<number>, newSize: { x: number, y: number }): Data<number> {
    // console.log('downsampleX')
    console.time('downsampleX')
    const w0 = input.nColumns;
    const h0 = input.nRows;
    const w1 = newSize.x;
    const h1 = newSize.y;
    const { from: x_from, to: x_to, weight: x_weight } = resamplingCoefficients(w0, w1);
    const x_len = x_from.length;
    const input_items = input.items;
    const out = new Float32Array(h1 * w1); // Use better precision here to avoid rounding errors when summing many small numbers
    for (let i = 0; i < h0; i++) { // row index
        const y_from_offset = i * w0;
        const y_to_offset = i * w1;
        for (let j = 0; j < x_len; j++) { // column index
            const inputValue = input_items[y_from_offset + x_from[j]];
            if (inputValue === undefined) throw new Error('NotImplementedError: undefined values in data'); // TODO also treat NaN and Infs specially
            out[y_to_offset + x_to[j]] += inputValue * x_weight[j];
        }
    }
    const result: Data<number> = { nColumns: w1, nRows: h1, items: out, isNumeric: true };
    console.timeEnd('downsampleX')
    return result;
}

function halveX(data: Data<number>): Data<number> {
    // console.log('halveX')
    console.time('halveX')
    const oldColumns = data.nColumns;
    const oldValues = data.items;
    if (oldColumns % 2 !== 0) throw new Error('ValueError: odd number of columns');
    const newColumns = Math.floor(oldColumns / 2);
    const newRows = data.nRows;
    const newValues = new Float32Array(newColumns * newRows); // Use better precision here to avoid rounding errors when summing many small numbers

    for (let j = 0; j < newRows; j++) {
        // TODO: could avoid so many repeated multiplications here
        for (let i = 0; i < newColumns; i++) {
            const old1 = oldValues[j * oldColumns + 2 * i];
            const old2 = oldValues[j * oldColumns + 2 * i + 1];
            if (old1 === undefined || old2 === undefined) throw new Error('NotImplementedError: undefined values in data'); // TODO also treat NaN and Infs specially
            const val = 0.5 * (old1 + old2);
            newValues[j * newColumns + i] = val;
        }
    }
    const result: Data<number> = { nColumns: newColumns, nRows: newRows, items: newValues, isNumeric: true };
    console.timeEnd('halveX')
    return result;
}

/** Up- or down-sample image to a new size. */
function downsampleXY_RGBA(input: Image, newSize: { x: number, y: number }): Image {
    console.time(`downsampleXY_RGBA ${input.nColumns}x${input.nRows} -> ${newSize.x}x${newSize.y}`)
    const w0 = input.nColumns;
    const h0 = input.nRows;
    const w1 = newSize.x;
    const h1 = newSize.y;
    const nChannels = Math.floor(input.items.length / (h0 * w0));
    if (nChannels !== 4) throw new Error('AssertionError: number of channels must be 4');
    const y = resamplingCoefficients(h0, h1);
    const x = resamplingCoefficients(w0, w1);
    const out = new Uint8ClampedArray(h1 * w1 * nChannels); // Use better precision here to avoid rounding errors when summing many small numbers
    for (let i = 0; i < y.from.length; i++) { // row index
        for (let j = 0; j < x.from.length; j++) { // column index
            const fromOffset = (y.from[i] * w0 + x.from[j]) * nChannels;
            const toOffset = (y.to[i] * w1 + x.to[j]) * nChannels;
            const weight = y.weight[i] * x.weight[j];
            const a = input.items[fromOffset];
            const ra = input.items[fromOffset + 1];
            const ga = input.items[fromOffset + 2];
            const ba = input.items[fromOffset + 3];
            out[toOffset] += a * weight;
            out[toOffset + 1] += ra * weight;
            out[toOffset + 2] += ga * weight;
            out[toOffset + 3] += ba * weight;
        }
    }
    const result: Image = { nColumns: w1, nRows: h1, items: out };
    console.timeEnd(`downsampleXY_RGBA ${input.nColumns}x${input.nRows} -> ${newSize.x}x${newSize.y}`)
    return result;
}

/** Calculate the weights of how much each pixel in the old image contributes to pixels in the new image, for 1D images
 * (pixel `from[i]` contributes to pixel `to[i]` with weight `weight[i]`).
 * Typically one old pixel will contribute to more new pixels and vice versa.
 * Sum of weights contributed to each new pixel must be equal to 1.
 * To use for 2D images, calculate row-wise and column-wise weights and multiply them. */
function resamplingCoefficients(nOld: number, nNew: number) {
    const scale = nNew / nOld;
    let i = 0;
    let j = 0;
    let p = 0;
    const from = [];
    const to = [];
    const weight = [];
    while (p < nNew) {
        const nextINotch = scale * (i + 1);
        const nextJNotch = j + 1;
        if (nextINotch <= nextJNotch) {
            from.push(i);
            to.push(j);
            weight.push(nextINotch - p);
            p = nextINotch;
            i += 1;
            if (nextINotch === nextJNotch) {
                j += 1;
            }
        } else {
            from.push(i);
            to.push(j);
            weight.push(nextJNotch - p);
            p = nextJNotch;
            j += 1;
        }
    }
    return {
        /** Index of a pixel in the old image */
        from,
        /** Index of a pixel in the new image */
        to,
        /** How much the `from` pixel's value contributes to the `to` pixel */
        weight,
    };
}
