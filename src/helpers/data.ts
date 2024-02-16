import * as d3 from 'd3';


export type DataItem = number
export interface Data {
    nColumns: number,
    nRows: number,
    items: DataItem[],
}

export function makeRandomData(nColumns: number, nRows: number): Data {
    const items = d3.range(nColumns * nRows).map(i => {
        const x = i % nColumns;
        const y = Math.floor(i / nColumns);
        const value = (x === 0 || x === nColumns - 1 || y === 0 || y === nRows - 1) ? 1 : Math.random()
        return value;
    });
    return { nColumns, nRows, items };
}

export function getDataItem(data: Data, x: number, y: number): DataItem | undefined {
    if (x < 0 || x >= data.nColumns || y < 0 || y >= data.nRows) {
        return undefined;
        // throw new Error(`Data indices (${x}, ${y}) out of range (${data.nColumns}, ${data.nRows})`);
    }
    return data.items[data.nColumns * y + x];
}


export type Downsampling = { [coefficient: number]: Data }

/** This downsampling method is far from optimal, TODO think of something more rigorous */
export const Downsampling = {
    create(data: Data): Downsampling {
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
    getDownsampled(data: Downsampling, coefficient: number): Data {
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

function halve(data: Data) {
    const oldColumns = data.nColumns;
    const oldValues = data.items;
    const newColumns = Math.ceil(oldColumns / 2);
    const newRows = data.nRows;
    console.log('halve', oldColumns, '->', newColumns)
    const newValues = new Array(newColumns * newRows).fill(0);
    for (let j = 0; j < newRows; j++) {
        for (let i = 0; i < newColumns - 1; i++) {
            const val = (oldValues[j * oldColumns + 2 * i] + oldValues[j * oldColumns + 2 * i + 1]) / 2; // could avoid so many repeated multiplications here
            newValues[j * newColumns + i] = val;
        }
        if (oldColumns % 2 == 0) {
            const val = (oldValues[j * oldColumns + oldColumns - 2] + oldValues[j * oldColumns + oldColumns - 1]) / 2; // could avoid so many repeated multiplications here
            newValues[j * newColumns + newColumns - 1] = val;
        } else {
            const val = oldValues[j * oldColumns + oldColumns - 1] / 2; // could avoid so many repeated multiplications here
            newValues[j * newColumns + newColumns - 1] = val;
        }
    }
    return { nColumns: newColumns, nRows: newRows, items: newValues };
}