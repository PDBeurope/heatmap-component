import { range } from 'lodash';
import { Array2D } from './array2d';
import { Domain } from './domain';


/** A function that returns something (of type `TResult`) for a data item (such functions are passed to setTooltip, setColor etc.). */
export type Provider<TX, TY, TItem, TResult> = (d: TItem, x: TX, y: TY, xIndex: number, yIndex: number) => TResult


export type DataDescription<TX, TY, TItem> = {
    /** Array of X values assigned to columns, from left to right ("column names") */
    xDomain: TX[],
    /** Array of Y values assigned to rows, from top to bottom ("row names") */
    yDomain: TY[],
    /** Data items to show in the heatmap (each item is visualized as a rectangle) */
    items: TItem[],
    /** X values for the data items (either an array with the X values (must have the same length as `items`), or a function that computes X value for given item)  */
    x: ((dataItem: TItem, index: number) => TX) | TX[],
    /** Y values for the data items (either an array with the Y values (must have the same length as `items`), or a function that computes Y value for given item)  */
    y: ((dataItem: TItem, index: number) => TY) | TY[],
    /** Optional filter function that can be used to show only a subset of data items */
    filter?: Provider<TX, TY, TItem, boolean>,
}

export const DataDescription = {
    /** Return a DataDescription with no data. */
    empty<TX, TY, TItem>(): DataDescription<TX, TY, TItem> {
        return { xDomain: [], yDomain: [], items: [], x: [], y: [] };
    },
    /** Place items into a 2D array, return the 2D array and domains. */
    toArray2D<TX, TY, TItem>(data: DataDescription<TX, TY, TItem>): { array2d: Array2D<TItem>, xDomain: Domain<TX>, yDomain: Domain<TY> } {
        const { items, x, y, filter } = data;
        const xDomain = Domain.create(data.xDomain);
        const yDomain = Domain.create(data.yDomain);
        const nColumns = xDomain.values.length;
        const nRows = yDomain.values.length;
        const arr = new Array<TItem | undefined>(nColumns * nRows).fill(undefined);
        const xs = (typeof x === 'function') ? items.map(x) : x;
        const ys = (typeof y === 'function') ? items.map(y) : y;
        let warnedX = false;
        let warnedY = false;
        for (let i = 0; i < items.length; i++) {
            const d = items[i];
            const x = xs[i];
            const y = ys[i];
            const ix = xDomain.index.get(x);
            const iy = yDomain.index.get(y);
            if (ix === undefined) {
                if (!warnedX) {
                    console.warn('Some data items map to X values out of the X domain:', d, 'maps to X', x);
                    warnedX = true;
                }
            } else if (iy === undefined) {
                if (!warnedY) {
                    console.warn('Some data items map to Y values out of the Y domain:', d, 'maps to Y', y);
                    warnedY = true;
                }
            } else if (filter !== undefined && !filter(d, x, y, ix, iy)) {
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
            items: raw.items as number[],
            x: (d, i) => i % nColumns,
            y: (d, i) => Math.floor(i / nColumns),
            xDomain: range(nColumns),
            yDomain: range(nRows),
        };
    },

    /** Create partly random data having a gradient from left to right */
    createRandomWithGradient(nColumns: number, nRows: number): DataDescription<number, number, number> {
        const data = this.createRandom(nColumns, nRows);
        return {
            ...data,
            items: data.items.map((d, i) => (d * 0.5) + (i % nColumns / nColumns * 0.5)),
        };
    },
};
