import { range } from 'lodash';
import { IsNumeric } from './utils';


/** Represents a 2D array of values of type `TItem | undefined` */
export interface Data<TItem> {
    /** Number of columns */
    nColumns: number,
    /** Number of rows */
    nRows: number,
    /** Data items. Item for column `x`, row `y` is saved at index `y*nColumn+x`. */
    items: ArrayLike<TItem | undefined>,
    /** Indicates whether the values are numbers */
    isNumeric: IsNumeric<TItem>,
}

export const Data = {
    /** Get the value at column `x`, row `y` */
    getItem<TItem>(data: Data<TItem>, x: number, y: number): TItem | undefined {
        if (x < 0 || x >= data.nColumns || y < 0 || y >= data.nRows) {
            return undefined;
        }
        return data.items[data.nColumns * y + x];
    },

    /** Return new `Data` with random values between 0 and 1 */
    createRandom(nColumns: number, nRows: number): Data<number> {
        const items = range(nColumns * nRows).map(i => {
            const x = i % nColumns;
            const y = Math.floor(i / nColumns);
            const value = (x === 0 || y === nRows - 1) ? 0 : (x === nColumns - 1 || y === 0) ? 1 : Math.random();
            // const value = (x === 0 || y === nRows - 1) ? 0 : (x === nColumns - 1 || y === 0) ? 1 : (x%2);
            return value;
        });
        return { nColumns, nRows, items, isNumeric: true };
    },

    /** Return minimum and maximum value in the data */
    getRange(data: Data<number>): { min: number, max: number } {
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
};


/** Represents a 2D image in RGB with alpha channel` */
export interface Image {
    /** Number of columns */
    nColumns: number,
    /** Number of rows */
    nRows: number,
    /** Pixel colors saved in "ARaGaBa" 4-tuples (`alpha*255`, `red*alpha`, `green*alpha`, `blue*alpha`), this is a good representation for image downsampling.
     * Values for column `x`, row `y` are saved at index `(y*nColumn+x)*4` and three following indices. */
    items: Uint8ClampedArray,
}

export const Image = {
    /** Create a new image filled with fully transparent black */
    create(width: number, height: number): Image {
        return { nColumns: width, nRows: height, items: new Uint8ClampedArray(width * height * 4) };
    },
};
