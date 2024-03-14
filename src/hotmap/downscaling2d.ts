import { WritableArrayLike } from './color';
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


type ResolutionString = `${number}x${number}`

function resolutionString(resolution: XY): ResolutionString {
    return `${resolution.x}x${resolution.y}`;
}

export interface Image {
    nColumns: number,
    nRows: number,
    /** Pixels saved in 4-tuples (alpha, red*alpha, green*alpha, blue*alpha) */
    items: Uint8ClampedArray,
}


type DownsamplingMode = 'number' | 'image'
type DataType<M extends DownsamplingMode> = M extends 'image' ? Image : Data<number>

export type Downsampling2D<TMode extends DownsamplingMode = DownsamplingMode> = {
    mode: TMode,
    /** Column count of the original data */
    nColumns: number,
    /** Rows count of the original data */
    nRows: number,
    /** Downsampled version of the original data (index {nColumn}x{nRows} holds the original data) */
    downsampled: { [resolution: ResolutionString]: DataType<TMode> }
}

export function createNumberDownsampling(data: Data<number>): Downsampling2D<'number'> {
    const result: Downsampling2D<'number'> = { mode: 'number', nColumns: data.nColumns, nRows: data.nRows, downsampled: {} };
    set(result, { x: data.nColumns, y: data.nRows }, data);
    console.time('createNumberDownsampling get 1x1')
    getOrCompute(result, { x: 1, y: 1 });
    console.timeEnd('createNumberDownsampling get 1x1')
    return result;
}
export function createImageDownsampling(data: Image): Downsampling2D<'image'> {
    const result: Downsampling2D<'image'> = { mode: 'image', nColumns: data.nColumns, nRows: data.nRows, downsampled: {} };
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
    const targetResolution: XY = {
        x: downsamplingTarget(downsampling.nColumns, minResolution.x),
        y: downsamplingTarget(downsampling.nRows, minResolution.y),
    };
    return getOrCompute(downsampling, targetResolution);

}

function getOrCompute<M extends DownsamplingMode>(downsampling: Downsampling2D<M>, resolution: XY): DataType<M> {
    const cached = get(downsampling, resolution);
    if (cached) {
        return cached;
    } else {
        const srcResolution = downscaleSource2D(resolution, { x: downsampling.nColumns, y: downsampling.nRows });
        if (!srcResolution || srcResolution.x > downsampling.nColumns || srcResolution.y > downsampling.nRows) throw new Error('AssertionError');
        const srcData: DataType<M> = getOrCompute(downsampling, srcResolution);
        const result = (downsampling.mode === 'image' ? downsampleImage(srcData as DataType<'image'>, resolution) : downsampleNumbers(srcData as DataType<'number'>, resolution)) as DataType<M>;
        set(downsampling, resolution, result);
        return result;
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
    console.time('downsampleNumbers_general')
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
            if (inputValue === undefined) throw new Error('NotImplementedError: undefined values in data'); // TODO also treat NaN and Infs specially
            out[y_to_offset + x.to[j]] += inputValue * y_weight * x.weight[j];
        }
    }
    const result: Data<number> = { nColumns: w1, nRows: h1, items: out, isNumeric: true };
    console.timeEnd('downsampleNumbers_general')
    return result;
}

/** Downsample 2D array of numbers to a new size - simplified implementation for special cases when newX===oldX/2, newY===oldY. */
function downsampleNumbers_halveX(input: Data<number>): Data<number> {
    console.time('downsampleNumbers_halveX')
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
            if (old1 === undefined || old2 === undefined) throw new Error('NotImplementedError: undefined values in data'); // TODO also treat NaN and Infs specially
            const val = 0.5 * (old1 + old2);
            out[i * w1 + j] = val;
        }
    }
    const result: Data<number> = { nColumns: w1, nRows: h1, items: out, isNumeric: true };
    console.timeEnd('downsampleNumbers_halveX')
    return result;
}
/** Downsample 2D array of numbers to a new size - simplified implementation for special cases when newX===oldX, newY===oldY/2. */
function downsampleNumbers_halveY(input: Data<number>): Data<number> {
    const w0 = input.nColumns;
    const h0 = input.nRows;
    const w1 = w0;
    const h1 = Math.floor(h0 / 2);
    console.time('downsampleNumbers_halveY')
    if (input.items.length !== h0 * w0) throw new Error('ValueError: length of input.items must be input.nColumns * input.nRows');
    const out = new Float32Array(w1 * h1);
    for (let i = 0; i < h1; i++) { // row index
        for (let j = 0; j < w1; j++) { // column index
            const old1 = input.items[2 * i * w0 + j];
            const old2 = input.items[(2 * i + 1) * w0 + j];
            if (old1 === undefined || old2 === undefined) throw new Error('NotImplementedError: undefined values in data'); // TODO also treat NaN and Infs specially
            const val = 0.5 * (old1 + old2);
            out[i * w1 + j] = val;
        }
    }
    const result: Data<number> = { nColumns: w1, nRows: h1, items: out, isNumeric: true };
    console.timeEnd('downsampleNumbers_halveY')
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
    console.time(`downsampleImage_general ${w0}x${h0} -> ${w1}x${h1}`)
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
    console.timeEnd(`downsampleImage_general ${w0}x${h0} -> ${w1}x${h1}`)
    return result;
}

/** Downsample image to a new size - simplified implementation for special cases when newX===oldX/2, newY===oldY. */
function downsampleImage_halveX(input: Image): Image {
    const N_CHANNELS = 4;
    const w0 = input.nColumns;
    const h0 = input.nRows;
    const w1 = Math.floor(w0 / 2);
    const h1 = h0;
    console.time(`downsampleImage_halveX ${w0}x${h0} -> ${w1}x${h1}`)
    if (input.items.length != N_CHANNELS * h0 * w0) throw new Error('ValueError: length of Image.items must be 4 * Image.nColumns * Image.nRows');
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
    console.timeEnd(`downsampleImage_halveX ${w0}x${h0} -> ${w1}x${h1}`)
    return result;
}

/** Downsample image to a new size - simplified implementation for special cases when newX===oldX, newY===oldY/2. */
function downsampleImage_halveY(input: Image): Image {
    const N_CHANNELS = 4;
    const w0 = input.nColumns;
    const h0 = input.nRows;
    const w1 = w0;
    const h1 = Math.floor(h0 / 2);
    console.time(`downsampleImage_y ${w0}x${h0} -> ${w1}x${h1}`)
    if (input.items.length != N_CHANNELS * h0 * w0) throw new Error('ValueError: length of Image.items must be 4 * Image.nColumns * Image.nRows');
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
    console.timeEnd(`downsampleImage_y ${w0}x${h0} -> ${w1}x${h1}`)
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
