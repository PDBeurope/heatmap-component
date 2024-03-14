import { Data, Image } from './data';
import { XY } from './scales';


type DownsamplingMode = 'number' | 'image'

type DataType<M extends DownsamplingMode> = M extends 'image' ? Image : M extends 'number' ? Data<number> : never

type ResolutionString = `${number}x${number}`

function resolutionString(resolution: XY): ResolutionString {
    return `${resolution.x}x${resolution.y}`;
}


/** Helper object for downsampling images and 2D number arrays, with caching */
export type Downsampler<TMode extends DownsamplingMode = DownsamplingMode> = {
    /** Downsampling mode ('number' or 'image') */
    mode: TMode,
    /** Column count of the original data */
    nColumns: number,
    /** Rows count of the original data */
    nRows: number,
    /** Downsampled version of the original data (index {nColumn}x{nRows} holds the original data) */
    downsampled: { [resolution: ResolutionString]: DataType<TMode> }
}

export const Downsampler = {
    /** Create a new downsampler for a 2D number array */
    fromNumbers(data: Data<number>): Downsampler<'number'> {
        const result: Downsampler<'number'> = { mode: 'number', nColumns: data.nColumns, nRows: data.nRows, downsampled: {} };
        set(result, { x: data.nColumns, y: data.nRows }, data);
        return result;
    },

    /** Create a new downsampler for an image */
    fromImage(data: Image): Downsampler<'image'> {
        const result: Downsampler<'image'> = { mode: 'image', nColumns: data.nColumns, nRows: data.nRows, downsampled: {} };
        set(result, { x: data.nColumns, y: data.nRows }, data);
        return result;
    },

    /** Get data downsampled approximately to `minResolution`.
     * The returned resolution will be at least `minResolution` but less then double that, in each dimension.
     * The returned data will be equal to the original data if `minResolution` is big enough. */
    getDownsampled<M extends DownsamplingMode>(downsampler: Downsampler<M>, minResolution: XY): DataType<M> {
        const targetResolution: XY = {
            x: downsamplingTarget(downsampler.nColumns, minResolution.x),
            y: downsamplingTarget(downsampler.nRows, minResolution.y),
        };
        return getOrCompute(downsampler, targetResolution);
    },
};



/** Return `m`, a power of 2 or equal to `nDatapoints`, such that:
 * `nPixels <= m < 2*nPixels`  or  `m === nDatapoints < nPixels` */
function downsamplingTarget(nDatapoints: number, nPixels: number): number {
    let result = 1;
    while (result < nPixels && result < nDatapoints) {
        result = Math.min(2 * result, nDatapoints);
    }
    return result;
}

function get<M extends DownsamplingMode>(downsampler: Downsampler<M>, resolution: XY): DataType<M> | undefined {
    return downsampler.downsampled[resolutionString(resolution)];
}
function set<M extends DownsamplingMode>(downsampler: Downsampler<M>, resolution: XY, value: DataType<M>): undefined {
    downsampler.downsampled[resolutionString(resolution)] = value;
}

/** Get data downsampled to `resolution` (exactly).  */
function getOrCompute<M extends DownsamplingMode>(downsampler: Downsampler<M>, resolution: XY): DataType<M> {
    const cached = get(downsampler, resolution);
    if (cached) {
        return cached;
    } else {
        const srcResolution = downsamplingSource2D(resolution, { x: downsampler.nColumns, y: downsampler.nRows });
        if (!srcResolution || srcResolution.x > downsampler.nColumns || srcResolution.y > downsampler.nRows) throw new Error('AssertionError');
        const srcData: DataType<M> = getOrCompute(downsampler, srcResolution);
        const result = (downsampler.mode === 'image' ? downsampleImage(srcData as DataType<'image'>, resolution) : downsampleNumbers(srcData as DataType<'number'>, resolution)) as DataType<M>;
        set(downsampler, resolution, result);
        return result;
    }
}

/** Return resolution from which `wanted` resolution should be obtained by downsampling.
 * This will have either X length or Y length doubled (or same as in `original` if doubled would be more that original) and the other length kept the same.
 * Return `undefined` if `wanted` is already equal to `original`. */
function downsamplingSource2D(wanted: XY, original: XY): XY | undefined {
    if (wanted.x > original.x || wanted.y > original.y) {
        throw new Error('ArgumentError: Cannot downsample to higher resolution than original');
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


/** Downsample 2D array of numbers to a new size. */
function downsampleNumbers(input: Data<number>, newSize: XY): Data<number> {
    if (input.nColumns === 2 * newSize.x && input.nRows === newSize.y) {
        return downsampleNumbers_halveX(input);
    } else if (input.nColumns === newSize.x && input.nRows === 2 * newSize.y) {
        return downsampleNumbers_halveY(input);
    } else {
        return downsampleNumbers_general(input, newSize);
    }
}

/** Downsample 2D array of numbers to a new size - implementation for general sizes. */
function downsampleNumbers_general(input: Data<number>, newSize: { x: number, y: number }): Data<number> {
    const w0 = input.nColumns;
    const h0 = input.nRows;
    const w1 = newSize.x;
    const h1 = newSize.y;
    if (input.items.length !== h0 * w0) throw new Error('ValueError: length of input.items must be input.nColumns * input.nRows');
    const x = resamplingCoefficients(w0, w1);
    const y = resamplingCoefficients(h0, h1);
    const out = new Float32Array(h1 * w1);
    for (let i = 0; i < y.from.length; i++) { // row index
        const y_from_offset = y.from[i] * w0;
        const y_to_offset = y.to[i] * w1;
        const y_weight = y.weight[i];
        for (let j = 0; j < x.from.length; j++) { // column index
            const inputValue = input.items[y_from_offset + x.from[j]];
            if (inputValue === undefined) throw new Error('NotImplementedError: undefined values in data');
            out[y_to_offset + x.to[j]] += inputValue * y_weight * x.weight[j];
        }
    }
    const result: Data<number> = { nColumns: w1, nRows: h1, items: out, isNumeric: true };
    return result;
}

/** Downsample 2D array of numbers to a new size - simplified implementation for special cases when newX===oldX/2, newY===oldY. */
function downsampleNumbers_halveX(input: Data<number>): Data<number> {
    const w0 = input.nColumns;
    const h0 = input.nRows;
    const w1 = Math.floor(w0 / 2);
    const h1 = h0;
    if (input.items.length !== h0 * w0) throw new Error('ValueError: length of input.items must be input.nColumns * input.nRows');
    const out = new Float32Array(w1 * h1);
    for (let i = 0; i < h1; i++) { // row index
        for (let j = 0; j < w1; j++) { // column index
            const old1 = input.items[i * w0 + 2 * j];
            const old2 = input.items[i * w0 + 2 * j + 1];
            if (old1 === undefined || old2 === undefined) throw new Error('NotImplementedError: undefined values in data');
            const val = 0.5 * (old1 + old2);
            out[i * w1 + j] = val;
        }
    }
    const result: Data<number> = { nColumns: w1, nRows: h1, items: out, isNumeric: true };
    return result;
}
/** Downsample 2D array of numbers to a new size - simplified implementation for special cases when newX===oldX, newY===oldY/2. */
function downsampleNumbers_halveY(input: Data<number>): Data<number> {
    const w0 = input.nColumns;
    const h0 = input.nRows;
    const w1 = w0;
    const h1 = Math.floor(h0 / 2);
    if (input.items.length !== h0 * w0) throw new Error('ValueError: length of input.items must be input.nColumns * input.nRows');
    const out = new Float32Array(w1 * h1);
    for (let i = 0; i < h1; i++) { // row index
        for (let j = 0; j < w1; j++) { // column index
            const old1 = input.items[2 * i * w0 + j];
            const old2 = input.items[(2 * i + 1) * w0 + j];
            if (old1 === undefined || old2 === undefined) throw new Error('NotImplementedError: undefined values in data');
            const val = 0.5 * (old1 + old2);
            out[i * w1 + j] = val;
        }
    }
    const result: Data<number> = { nColumns: w1, nRows: h1, items: out, isNumeric: true };
    return result;
}


/** Downsample image to a new size. */
function downsampleImage(input: Image, newSize: XY): Image {
    if (input.nColumns === 2 * newSize.x && input.nRows === newSize.y) {
        return downsampleImage_halveX(input);
    } else if (input.nColumns === newSize.x && input.nRows === 2 * newSize.y) {
        return downsampleImage_halveY(input);
    } else {
        return downsampleImage_general(input, newSize);
    }
}

/** Downsample image to a new size - implementation for general sizes. */
function downsampleImage_general(input: Image, newSize: XY): Image {
    const N_CHANNELS = 4;
    const w0 = input.nColumns;
    const h0 = input.nRows;
    const w1 = newSize.x;
    const h1 = newSize.y;
    if (input.items.length !== N_CHANNELS * h0 * w0) throw new Error('ValueError: length of Image.items must be 4 * Image.nColumns * Image.nRows');
    const y = resamplingCoefficients(h0, h1);
    const x = resamplingCoefficients(w0, w1);
    const out = new Uint8ClampedArray(h1 * w1 * N_CHANNELS); // We will always downsample by a factor between 1 and 2, so rounding errors here are not a big issue (for higher factors the errors could sum up to a big error)
    for (let i = 0; i < y.from.length; i++) { // row index
        for (let j = 0; j < x.from.length; j++) { // column index
            const fromOffset = (y.from[i] * w0 + x.from[j]) * N_CHANNELS;
            const toOffset = (y.to[i] * w1 + x.to[j]) * N_CHANNELS;
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
    return result;
}

/** Downsample image to a new size - simplified implementation for special cases when newX===oldX/2, newY===oldY. */
function downsampleImage_halveX(input: Image): Image {
    const N_CHANNELS = 4;
    const w0 = input.nColumns;
    const h0 = input.nRows;
    const w1 = Math.floor(w0 / 2);
    const h1 = h0;
    if (input.items.length !== N_CHANNELS * h0 * w0) throw new Error('ValueError: length of Image.items must be 4 * Image.nColumns * Image.nRows');
    const out = new Uint8ClampedArray(h1 * w1 * N_CHANNELS);
    for (let i = 0; i < h1; i++) { // row index
        for (let j = 0; j < w1; j++) { // column index
            const fromOffset1 = (i * w0 + 2 * j) * N_CHANNELS;
            const fromOffset2 = (i * w0 + 2 * j + 1) * N_CHANNELS;
            const toOffset = (i * w1 + j) * N_CHANNELS;
            out[toOffset] = 0.5 * (input.items[fromOffset1] + input.items[fromOffset2]);
            out[toOffset + 1] = 0.5 * (input.items[fromOffset1 + 1] + input.items[fromOffset2 + 1]);
            out[toOffset + 2] = 0.5 * (input.items[fromOffset1 + 2] + input.items[fromOffset2 + 2]);
            out[toOffset + 3] = 0.5 * (input.items[fromOffset1 + 3] + input.items[fromOffset2 + 3]);
        }
    }
    const result: Image = { nColumns: w1, nRows: h1, items: out };
    return result;
}

/** Downsample image to a new size - simplified implementation for special cases when newX===oldX, newY===oldY/2. */
function downsampleImage_halveY(input: Image): Image {
    const N_CHANNELS = 4;
    const w0 = input.nColumns;
    const h0 = input.nRows;
    const w1 = w0;
    const h1 = Math.floor(h0 / 2);
    if (input.items.length !== N_CHANNELS * h0 * w0) throw new Error('ValueError: length of Image.items must be 4 * Image.nColumns * Image.nRows');
    const out = new Uint8ClampedArray(h1 * w1 * N_CHANNELS);
    for (let i = 0; i < h1; i++) { // row index
        for (let j = 0; j < w1; j++) { // column index
            const fromOffset1 = (2 * i * w0 + j) * N_CHANNELS;
            const fromOffset2 = ((2 * i + 1) * w0 + j) * N_CHANNELS;
            const toOffset = (i * w1 + j) * N_CHANNELS;
            out[toOffset] = 0.5 * (input.items[fromOffset1] + input.items[fromOffset2]);
            out[toOffset + 1] = 0.5 * (input.items[fromOffset1 + 1] + input.items[fromOffset2 + 1]);
            out[toOffset + 2] = 0.5 * (input.items[fromOffset1 + 2] + input.items[fromOffset2 + 2]);
            out[toOffset + 3] = 0.5 * (input.items[fromOffset1 + 3] + input.items[fromOffset2 + 3]);
        }
    }
    const result: Image = { nColumns: w1, nRows: h1, items: out };
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
