import { range } from 'lodash';
import { Array2D } from './array2d';
import { Domain } from './domain';


/** A function that returns something (of type `TResult`) for a data cell (such functions are passed to `setTooltip`, `setColor` etc.). */
export type Provider<TX, TY, TDatum, TResult> = (datum: TDatum, x: TX, y: TY, xIndex: number, yIndex: number) => TResult


/** Description of heatmap data as passed to the Heatmap class. */
export type DataDescription<TX, TY, TDatum> = {
    /** Array of X values assigned to columns, from left to right ("column names") */
    xDomain: TX[],
    /** Array of Y values assigned to rows, from top to bottom ("row names") */
    yDomain: TY[],
    /** Data items to show in the heatmap (each item is visualized as a rectangle) */
    data: ArrayLike<TDatum>,
    /** X values for the data items (either a function that computes X value for given datum, or an array with the X values (must have the same length as `data`))  */
    x: ((datum: TDatum, index: number) => TX) | TX[],
    /** Y values for the data items (either a function that computes Y value for given datum, or an array with the Y values (must have the same length as `data`) )  */
    y: ((datum: TDatum, index: number) => TY) | TY[],
    /** Optional filter function that can be used to show only a subset of data */
    filter?: Provider<TX, TY, TDatum, boolean>,
}

export const DataDescription = {
    /** Return a `DataDescription` with no data. */
    empty<TX, TY, TDatum>(): DataDescription<TX, TY, TDatum> {
        return { data: [], xDomain: [null as TX], yDomain: [null as TY], x: () => null as TX, y: () => null as TY };
    },
    /** Place data items into a 2D array, return the 2D array and domains. */
    toArray2D<TX, TY, TDatum>(data: DataDescription<TX, TY, TDatum>): { array2d: Array2D<TDatum | undefined>, xDomain: Domain<TX>, yDomain: Domain<TY> } {
        const { data: items, x, y, filter } = data;
        const xDomain = Domain.create(data.xDomain);
        const yDomain = Domain.create(data.yDomain);
        const nColumns = xDomain.values.length;
        const nRows = yDomain.values.length;
        const arr = new Array<TDatum | undefined>(nColumns * nRows).fill(undefined);
        const xFunction = (typeof x === 'function') ? x : (d: TDatum, i: number) => x[i];
        const yFunction = (typeof y === 'function') ? y : (d: TDatum, i: number) => y[i];
        let warnedX = false;
        let warnedY = false;
        for (let i = 0; i < items.length; i++) {
            const d = items[i];
            const xValue = xFunction(d, i);
            const yValue = yFunction(d, i);
            const ix = xDomain.index.get(xValue);
            const iy = yDomain.index.get(yValue);
            if (ix === undefined) {
                if (!warnedX) {
                    console.warn('Some data items map to X values out of the X domain:', d, 'maps to X', xValue);
                    warnedX = true;
                }
            } else if (iy === undefined) {
                if (!warnedY) {
                    console.warn('Some data items map to Y values out of the Y domain:', d, 'maps to Y', yValue);
                    warnedY = true;
                }
            } else if (filter !== undefined && !filter(d, xValue, yValue, ix, iy)) {
                // skipping this item
            } else {
                arr[nColumns * iy + ix] = d;
            }
        }
        const array2d = Array2D.create(nColumns, nRows, arr);
        return { array2d, xDomain, yDomain };
    },

    /** Create random data */
    createRandom(nColumns: number, nRows: number): DataDescription<number, number, number> {
        const raw = Array2D.createRandom(nColumns, nRows);
        return {
            data: raw.values,
            x: (d, i) => i % nColumns,
            y: (d, i) => Math.floor(i / nColumns),
            xDomain: range(nColumns),
            yDomain: range(nRows),
        };
    },

    /** Create partly random data having a gradient from left to right, and special values around the edges */
    createDummy(nColumns: number, nRows: number): DataDescription<number, number, number> {
        const raw = Array2D.createDummy(nColumns, nRows);
        return {
            data: raw.values,
            x: (d, i) => i % nColumns,
            y: (d, i) => Math.floor(i / nColumns),
            xDomain: range(nColumns),
            yDomain: range(nRows),
        };
    },
};
