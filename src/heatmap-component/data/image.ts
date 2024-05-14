import { Color } from './color';


/** Represents a 2D image in RGB with alpha channel (saved in a special way to simplify downsampling) */
export interface Image {
    /** Number of columns */
    nColumns: number,
    /** Number of rows */
    nRows: number,
    /** Pixel colors saved in "ARaGaBa" 4-tuples (`alpha*255`, `red*alpha`, `green*alpha`, `blue*alpha`).
     * This is a good representation for image downsampling.
     * Values for column `x`, row `y` are saved at index `(y*nColumn+x)*4` and three following indices. */
    values: Uint8ClampedArray,
}

export const Image = {
    /** Create a new image filled with transparent black */
    create(width: number, height: number): Image {
        return { nColumns: width, nRows: height, values: new Uint8ClampedArray(width * height * 4) };
    },

    /** Clear the whole image to transparent black */
    clear(image: Image) {
        image.values.fill(0);
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
        for (let i = 0, n = image.values.length; i < n; i += 4) {
            const color = Color.fromAragabaArray(image.values, i);
            Color.toRgbaArray(color, out.data, i);
        }
        return out;
    },

    /** Throw error if the length of `values` does not correspond to image size */
    validateLength(image: Image) {
        if (image.values.length !== 4 * image.nColumns * image.nRows) {
            throw new Error('ValueError: length of image.values must be 4 * image.nColumns * image.nRows');
        }
    },
};
