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
        }
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

export type Downsampling2D<TItem extends number> = {
    /** Column count of the original data */
    nColumns: number,
    /** Rows count of the original data */
    nRows: number,
    /** Downsampled version of the original data (index {nColumn}x{nRows} holds the original data) */
    downsampled: { [resolution: ResolutionString]: Data<TItem> }
}

function resolutionString(resolution: XY): ResolutionString {
    return `${resolution.x}x${resolution.y}`;
}

export function create<TItem extends number>(data: Data<TItem>): Downsampling2D<TItem> {
    const result: Downsampling2D<TItem> = { nColumns: data.nColumns, nRows: data.nRows, downsampled: {} };
    set(result, { x: data.nColumns, y: data.nRows }, data);
    return result;
}

function get<TItem extends number>(downsampling: Downsampling2D<TItem>, resolution: XY): Data<TItem> | undefined {
    return downsampling.downsampled[resolutionString(resolution)];
}
function set<TItem extends number>(downsampling: Downsampling2D<TItem>, resolution: XY, value: Data<TItem>): undefined {
    downsampling.downsampled[resolutionString(resolution)] = value;
}


/** Return `m`, a power of 2 or equal to `nDatapoints`, such that:
 * `nPixels <= m < 2*nPixels`  or  `m === nDatapoints < nPixels` */
export function downsamplingTarget(nDatapoints: number, nPixels: number): number { // TODO private
    let result = 1;
    while (result < nPixels && result < nDatapoints) {
        result = Math.min(2 * result, nDatapoints);
    }
    return result;
}


export function getDownsampledData<TItem extends number>(downsampling: Downsampling2D<TItem>, minResolution: XY): Data<TItem> {
    console.log('getDownsampledData', resolutionString(minResolution))
    const targetResolution: XY = {
        x: downsamplingTarget(downsampling.nColumns, minResolution.x),
        y: downsamplingTarget(downsampling.nRows, minResolution.y),
    };
    return getOrCompute(downsampling, targetResolution);

}

function getOrCompute<TItem extends number>(downsampling: Downsampling2D<TItem>, resolution: XY): Data<TItem> {
    console.log('getOrCompute', resolutionString(resolution))
    const cached = get(downsampling, resolution);
    if (cached) {
        return cached;
    } else {
        const srcResolution = downscaleSource2D(resolution, { x: downsampling.nColumns, y: downsampling.nRows });
        if (!srcResolution || srcResolution.x > downsampling.nColumns || srcResolution.y > downsampling.nRows) throw new Error('AssertionError');
        const srcData = getOrCompute(downsampling, srcResolution);
        const result = downsample(srcData, resolution);
        set(downsampling, resolution, result);
        return result;
    }
}

function downsample<TItem extends number>(data: Data<TItem>, targetResolution: XY): Data<TItem> {
    return downsampleXY(data, targetResolution) as Data<TItem>;
    const x = data.nColumns;
    const y = data.nRows
    if (targetResolution.x === x) {
        // downsample along Y
        if (y === 2 * targetResolution.y) {
            // halve
        } else {
            // general downsample
        }
    } else if (targetResolution.y === y) {
        // downsample along X
        if (x === 2 * targetResolution.x) {
            // halve
        } else {
            // general downsample
        }
    } else {
        throw new Error('ValueError: Cannot downsample along X and Y axis at the same time');

    }
    return data; // debug TODO: really implement
}

function halveX<TItem extends number>(data: Data<TItem>): Data<TItem> {
    const oldColumns = data.nColumns;
    const oldValues = data.items;
    if (oldColumns % 2 !== 0) throw new Error('ValueError: odd number of columns');
    const newColumns = Math.floor(oldColumns / 2);
    const newRows = data.nRows;
    const newValues = new Array<number>(newColumns * newRows).fill(0);

    for (let j = 0; j < newRows; j++) {
        // TODO: don't assert type but check
        // TODO: could avoid so many repeated multiplications here
        for (let i = 0; i < newColumns; i++) {
            const old1 = oldValues[j * oldColumns + 2 * i] as number;
            const old2 = oldValues[j * oldColumns + 2 * i + 1] as number;
            const val = (old1 + old2) / 2;
            newValues[j * newColumns + i] = val;
        }
        const old1 = oldValues[j * oldColumns + oldColumns - 2] as number;
        const old2 = oldValues[j * oldColumns + oldColumns - 1] as number;
        const val = (old1 + old2) / 2;
        newValues[j * newColumns + newColumns - 1] = val;
    }
    return { nColumns: newColumns, nRows: newRows, items: newValues } as Data<TItem>;
}


/** Up- or down-sample image to a new size. */
function downsampleXY(input: Data<number>, newSize: { x: number, y: number }): Data<number> {
    const w0 = input.nColumns;
    const h0 = input.nRows;
    const w1 = newSize.x;
    const h1 = newSize.y;
    const nChannels = Math.floor(input.items.length / (h0 * w0));
    if (nChannels !== 1) throw new Error('NotImplementedError: multiple channels');
    const y = resamplingCoefficients(h0, h1);
    const x = resamplingCoefficients(w0, w1);
    const out = new Float32Array(h1 * w1 * nChannels); // Use better precision here to avoid rounding errors when summing many small numbers
    for (let i = 0; i < y.from.length; i++) { // row index
        for (let j = 0; j < x.from.length; j++) { // column index
            for (let c = 0; c < nChannels; c++) { // channel index
                const inputValue = input.items[(y.from[i] * w0 + x.from[j]) * nChannels + c];
                if (inputValue === undefined) throw new Error('NotImplementedError: undefined values in data'); // TODO also treat NaN and Infs specially
                out[(y.to[i] * w1 + x.to[j]) * nChannels + c] += inputValue * y.weight[i] * x.weight[j];
                // TODO alpha-channel must be treated in a special way
            }
        }
    }
    return { nColumns: w1, nRows: h1, items: Array.from(out), isNumeric: true }; // TODO: do not force conversion to Array, keep Float32Array or whatever 
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