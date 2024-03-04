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


export type Downsampling2D<TItem extends number> = { [coefficient: number]: Data<TItem> }

// function create<TItem extends number>(data: Data<TItem>): Downsampling2<TItem> {
//     return { 1: data };
// }


/** Return `m`, a power of 2 or equal to `nDatapoints`, such that:
 * `nPixels <= m < 2*nPixels`  or  `m === nDatapoints < nPixels` */
export function downsamplingGoal(nDatapoints: number, nPixels: number) {
    let result = 1;
    while (result < nPixels && result < nDatapoints) {
        result = Math.min(2 * result, nDatapoints);
    }
    return result;
}

// function getDownsampled<TItem extends number>(data: Downsampling2D<TItem>, coefficient: number): Data<TItem> {
//     if (!data[coefficient]) {
//         let currentCoef = Math.max(...Object.keys(data).map(c => Number(c)).filter(c => c < coefficient));
//         while (currentCoef < coefficient) {
//             data[2 * currentCoef] = halve(data[currentCoef]);
//             currentCoef *= 2;
//         }
//     }
//     return data[coefficient];
//     throw new Error('NotImplementedError');
// }
