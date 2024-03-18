import { range } from 'lodash';
import { Color } from './color';
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

    validateLength(data: Data<any>) {
        if (data.items.length !== data.nColumns * data.nRows) {
            throw new Error('ValueError: length of Data.items must be Data.nColumns * Data.nRows');
        }
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
    /** Create a new image filled with transparent black */
    create(width: number, height: number): Image {
        return { nColumns: width, nRows: height, items: new Uint8ClampedArray(width * height * 4) };
    },

    /** Clear the whole image to transparent black */
    clear(image: Image) {
        image.items.fill(0);
    },

    /** Draw a filled rectangle to the image. Only use for non-overlapping rectangles!!! */
    addRect(image: Image, xmin: number, ymin: number, xmax: number, ymax: number, fill: Color) {
        xmin = Math.min(Math.max(xmin, 0), image.nColumns); // uglier but faster than lodash clamp
        xmax = Math.min(Math.max(xmax, 0), image.nColumns);
        ymin = Math.min(Math.max(ymin, 0), image.nRows);
        ymax = Math.min(Math.max(ymax, 0), image.nRows);
        const xFrom = Math.floor(xmin);
        const yFrom = Math.floor(ymin);
        const xTo = Math.ceil(xmax); // exclusive
        const yTo = Math.ceil(ymax); // exclusive
        for (let y = yFrom; y < yTo; y++) {
            const yWeight = Math.min(y + 1, ymax) - Math.max(y, ymin);
            for (let x = xFrom; x < xTo; x++) {
                const xWeight = Math.min(x + 1, xmax) - Math.max(x, xmin);
                const effectiveFill = Color.scaleAlpha(fill, xWeight * yWeight);
                Color.addToImage(effectiveFill, image, x, y);
            }
        }
    },

    /** Convert `Image` (ARaGaBa) to regular `ImageData` (RGBA) */
    toImageData(image: Image, out: ImageData): ImageData {
        for (let i = 0, n = image.items.length; i < n; i += 4) {
            const color = Color.fromAragabaArray(image.items, i);
            Color.toRgbaArray(color, out.data, i);
        }
        return out;
    },

    validateLength(image: Image) {
        if (image.items.length !== 4 * image.nColumns * image.nRows) {
            throw new Error('ValueError: length of Image.items must be 4 * Image.nColumns * Image.nRows');
        }
    },
};
