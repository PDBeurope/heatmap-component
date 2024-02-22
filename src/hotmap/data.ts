import * as d3 from 'd3';
import { IsNumeric } from './utils';


export interface Data<TItem> {
    nColumns: number,
    nRows: number,
    items: (TItem | undefined)[],
    isNumeric: IsNumeric<TItem>,
}

export function makeRandomRawData(nColumns: number, nRows: number): Data<number> {
    const items = d3.range(nColumns * nRows).map(i => {
        const x = i % nColumns;
        const y = Math.floor(i / nColumns);
        const value = (x === 0 || x === nColumns - 1 || y === 0 || y === nRows - 1) ? 1 : Math.random();
        return value;
    });
    return { nColumns, nRows, items, isNumeric: true };
}

export function getDataItem<TItem>(data: Data<TItem>, x: number, y: number): TItem | undefined {
    if (x < 0 || x >= data.nColumns || y < 0 || y >= data.nRows) {
        return undefined;
    }
    return data.items[data.nColumns * y + x];
}


export type Downsampling<TItem extends number> = { [coefficient: number]: Data<TItem> }

/** This downsampling method is far from optimal, TODO think of something more rigorous */
export const Downsampling = {
    create<TItem extends number>(data: Data<TItem>): Downsampling<TItem> {
        return { 1: data };
    },
    /** Return k, a power of 2, such that nPixels <= nDatapoints / k < 2*nPixels.
     * (If nDatapoints > nPixels, return 1.) */
    downsamplingCoefficient(nDatapoints: number, nPixels: number): number {
        let result = 1;
        while (nDatapoints >= 2 * nPixels) {
            result *= 2;
            nDatapoints /= 2;
        }
        return result;
    },
    getDownsampled<TItem extends number>(data: Downsampling<TItem>, coefficient: number): Data<TItem> {
        if (!data[coefficient]) {
            let currentCoef = Math.max(...Object.keys(data).map(c => Number(c)).filter(c => c < coefficient));
            while (currentCoef < coefficient) {
                data[2 * currentCoef] = halve(data[currentCoef]);
                currentCoef *= 2;
            }
        }
        return data[coefficient];
    }
};

function halve<TItem extends number>(data: Data<TItem>): Data<TItem> {
    const oldColumns = data.nColumns;
    const oldValues = data.items;
    const newColumns = Math.ceil(oldColumns / 2);
    const newRows = data.nRows;
    const newValues = new Array<number>(newColumns * newRows).fill(0);
    for (let j = 0; j < newRows; j++) {
        // TODO: don't assert type but check
        // TODO: could avoid so many repeated multiplications here
        for (let i = 0; i < newColumns - 1; i++) {
            const old1 = oldValues[j * oldColumns + 2 * i] as number;
            const old2 = oldValues[j * oldColumns + 2 * i + 1] as number;
            const val = (old1 + old2) / 2;
            newValues[j * newColumns + i] = val;
        }
        if (oldColumns % 2 === 0) {
            const old1 = oldValues[j * oldColumns + oldColumns - 2] as number;
            const old2 = oldValues[j * oldColumns + oldColumns - 1] as number;
            const val = (old1 + old2) / 2;
            newValues[j * newColumns + newColumns - 1] = val;
        } else {
            const old1 = oldValues[j * oldColumns + oldColumns - 1] as number;
            const val = old1 / 2;
            newValues[j * newColumns + newColumns - 1] = val;
        }
    }
    return { nColumns: newColumns, nRows: newRows, items: newValues } as Data<TItem>;
}

