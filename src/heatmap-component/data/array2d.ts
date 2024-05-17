import { range } from 'lodash';
import { IsNumeric } from '../utils';


/** Represents a 2D array of values of type `T` */
export interface Array2D<T> {
    /** Number of columns */
    nColumns: number,
    /** Number of rows */
    nRows: number,
    /** Data values. Value for column `x`, row `y` is saved at index `y*nColumns + x`. Use `Array2D.get()` instead of accessing directly. */
    values: ArrayLike<T>,
    /** Indicates whether the values are numbers */
    isNumeric: IsNumeric<T>,
}

export const Array2D = {
    /** Get the value at column `x`, row `y` */
    get<T>(data: Array2D<T>, x: number, y: number): T | undefined {
        if (x < 0 || x >= data.nColumns || y < 0 || y >= data.nRows) {
            return undefined;
        }
        return data.values[data.nColumns * y + x];
    },

    /** Return an Array2D with dimensions 0x0 with no data. */
    empty<T>(): Array2D<T> {
        return { nColumns: 0, nRows: 0, values: [], isNumeric: true as any };
    },

    /** Return an Array2D with dimensions nColumns x nRows. */
    create<T>(nColumns: number, nRows: number, values: T[]): Array2D<T> {
        if (values.length !== nColumns * nRows) throw new Error('ValueError: length of `values` must be nColumns * nRows');
        const isNumeric = values.every(d => typeof d === 'number') as IsNumeric<T>;
        return { nColumns, nRows, values, isNumeric };
    },

    /** Return new `Data` with random values between 0 and 1 */
    createRandom(nColumns: number, nRows: number): Array2D<number> {
        const values = range(nColumns * nRows).map(i => {
            const x = i % nColumns;
            const y = Math.floor(i / nColumns);
            const value = (x === 0 || y === nRows - 1) ? 0 : (x === nColumns - 1 || y === 0) ? 1 : Math.random();
            return value;
        });
        return { nColumns, nRows, values, isNumeric: true };
    },

    /** Return minimum and maximum value in the data */
    getRange(data: Array2D<number>): { min: number, max: number } {
        const values = data.values;
        const n = values.length;
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < n; i++) {
            const d = values[i];
            if (d < min) min = d;
            if (d > max) max = d;
        }
        return { min, max };
    },

    /** Throw error if the length of array does not match size given by `nColumns` and `nRows` */
    validateLength(data: Array2D<any>): void {
        if (data.values.length !== data.nColumns * data.nRows) {
            throw new Error('ValueError: length of data.values must be data.nColumns * data.nRows');
        }
    },
};
