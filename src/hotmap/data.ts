import { range } from 'lodash';
import { IsNumeric } from './utils';


/** Represents a 2D array of values of type `TItem | undefined` */
export interface Data<TItem> {
    nColumns: number,
    nRows: number,
    items: ArrayLike<TItem | undefined>,
    isNumeric: IsNumeric<TItem>,
}


/** Represents a 2D image in RGB with alpha channel` */
export interface Image {
    nColumns: number,
    nRows: number,
    /** Pixels saved in 4-tuples (alpha*255, red*alpha, green*alpha, blue*alpha), this is a good representation for image downsampling */
    items: Uint8ClampedArray,
}

export const Image = {
    create(width: number, height: number): Image {
        return { nColumns: width, nRows: height, items: new Uint8ClampedArray(width * height * 4) };
    },
};


export function makeRandomRawData(nColumns: number, nRows: number): Data<number> {
    const items = range(nColumns * nRows).map(i => {
        const x = i % nColumns;
        const y = Math.floor(i / nColumns);
        const value = (x === 0 || y === nRows - 1) ? 0 : (x === nColumns - 1 || y === 0) ? 1 : Math.random();
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
