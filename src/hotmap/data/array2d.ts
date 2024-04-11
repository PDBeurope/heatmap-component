import { range } from 'lodash';
import { IsNumeric } from '../utils';


/** Represents a 2D array of values of type `TItem | undefined` */
export interface Array2D<TItem> {
    /** Number of columns */
    nColumns: number,
    /** Number of rows */
    nRows: number,
    /** Data items. Item for column `x`, row `y` is saved at index `y*nColumn+x`. */
    items: ArrayLike<TItem | undefined>,
    /** Indicates whether the values are numbers */
    isNumeric: IsNumeric<TItem>,
}

export const Array2D = {
    /** Get the value at column `x`, row `y` */
    getItem<TItem>(data: Array2D<TItem>, x: number, y: number): TItem | undefined {
        if (x < 0 || x >= data.nColumns || y < 0 || y >= data.nRows) {
            return undefined;
        }
        return data.items[data.nColumns * y + x];
    },

    /** Return new `Data` with random values between 0 and 1 */
    createRandom(nColumns: number, nRows: number): Array2D<number> {
        const items = range(nColumns * nRows).map(i => {
            const x = i % nColumns;
            const y = Math.floor(i / nColumns);
            const value = (x === 0 || y === nRows - 1) ? 0 : (x === nColumns - 1 || y === 0) ? 1 : Math.random();
            return value;
        });
        return { nColumns, nRows, items, isNumeric: true };
    },

    /** Return minimum and maximum value in the data */
    getRange(data: Array2D<number>): { min: number, max: number } {
        const items = data.items;
        const n = items.length;
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < n; i++) {
            const d = items[i];
            if (d === undefined) continue;
            if (d < min) min = d;
            if (d > max) max = d;
        }
        return { min, max };
    },

    validateLength(data: Array2D<any>) {
        if (data.items.length !== data.nColumns * data.nRows) {
            throw new Error('ValueError: length of Data.items must be Data.nColumns * Data.nRows');
        }
    },
};
