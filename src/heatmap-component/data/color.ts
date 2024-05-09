import { clamp, range } from 'lodash';
import * as d3 from '../d3-modules';
import { Domain } from './domain';
import { Image } from './image';


/** Like ArrayLike<T> but allows writing (includes T[], Float32Array, etc.) */
export type WritableArrayLike<T> = { [i: number]: T, length: number }


/** Color value (with opacity) encoded as Int32 */
export type Color = { readonly '@type': 'color' } & number


const ALPHA_SCALE = 255;
const INV_ALPHA_SCALE = 1 / ALPHA_SCALE;


export const Color = {
    /** Cast Int32 into Int32-encoded color */
    fromNumber(hex: number): Color {
        return hex as Color;
    },
    /** Create Int32-encoded color from R (0-255), G (0-255), B (0-255), and opacity (0-1) */
    fromRgba(r: number, g: number, b: number, a: number): Color {
        return ((ALPHA_SCALE * a) << 24 | r << 16 | g << 8 | b) as Color;
    },
    /** Create Int32-encoded color from R (0-255), G (0-255), B (0-255), assuming full opacity */
    fromRgb(r: number, g: number, b: number): Color {
        return (ALPHA_SCALE << 24 | r << 16 | g << 8 | b) as Color;
    },
    /** Create Int32-encoded color from a CSS string */
    fromString(str: string): Color {
        const named: Color | undefined = ColorNames[str];
        if (named) return named;
        if (str[0] === '#') {
            if (str.length === 7) { // #RRGGBB
                return (OPAQUE
                    | hexValue(str.charCodeAt(1)) << 20 | hexValue(str.charCodeAt(2)) << 16
                    | hexValue(str.charCodeAt(3)) << 12 | hexValue(str.charCodeAt(4)) << 8
                    | hexValue(str.charCodeAt(5)) << 4 | hexValue(str.charCodeAt(6))
                ) as Color;
            }
            if (str.length === 9) { // #RRGGBBAA
                const a255 = hexValue(str.charCodeAt(7)) << 4 | hexValue(str.charCodeAt(8));
                return (a255 << 24
                    | hexValue(str.charCodeAt(1)) << 20 | hexValue(str.charCodeAt(2)) << 16
                    | hexValue(str.charCodeAt(3)) << 12 | hexValue(str.charCodeAt(4)) << 8
                    | hexValue(str.charCodeAt(5)) << 4 | hexValue(str.charCodeAt(6))
                ) as Color;
            }
            if (str.length === 4) { // #RGB
                return (OPAQUE
                    | 17 * hexValue(str.charCodeAt(1)) << 16
                    | 17 * hexValue(str.charCodeAt(2)) << 8
                    | 17 * hexValue(str.charCodeAt(3))
                ) as Color;
            }
            if (str.length === 5) { // #RGBA
                const a255 = 17 * hexValue(str.charCodeAt(4));
                return (a255 << 24
                    | 17 * hexValue(str.charCodeAt(1)) << 16
                    | 17 * hexValue(str.charCodeAt(2)) << 8
                    | 17 * hexValue(str.charCodeAt(3))
                ) as Color;
            }
        }
        const { r, g, b, opacity } = d3.rgb(str);
        if (isNaN(r) || isNaN(g) || isNaN(b) || isNaN(opacity)) return Color.fromRgba(0, 0, 0, 0);
        return Color.fromRgba(r, g, b, opacity);
    },
    /** Convert Int32-encoded color to a CSS-style hex string (#RRGGBB if full opacity, #RRGGBBAA otherwise) */
    toString(color: Color): string {
        const a255 = color >>> 24 & 255;
        if (a255 === ALPHA_SCALE) {
            return String.fromCharCode(35,
                hexDigitCode(color >>> 20 & 15), hexDigitCode(color >>> 16 & 15),
                hexDigitCode(color >>> 12 & 15), hexDigitCode(color >>> 8 & 15),
                hexDigitCode(color >>> 4 & 15), hexDigitCode(color & 15));
        } else {
            return String.fromCharCode(35,
                hexDigitCode(color >>> 20 & 15), hexDigitCode(color >>> 16 & 15),
                hexDigitCode(color >>> 12 & 15), hexDigitCode(color >>> 8 & 15),
                hexDigitCode(color >>> 4 & 15), hexDigitCode(color & 15),
                hexDigitCode(a255 >>> 4 & 15), hexDigitCode(a255 & 15));
        }
    },
    /** Return object with R, G, B (0-255), and opacity (0-1) values. */
    toRgba(color: Color): { r: number, g: number, b: number, opacity: number } | undefined {
        const a = INV_ALPHA_SCALE * (color >>> 24 & 255);
        const r = color >>> 16 & 255;
        const g = color >>> 8 & 255;
        const b = color & 255;
        return { r, g, b, opacity: a };
    },
    /** Save `color` in an array represented as RGBA (i.e. quadruplet [r, g, b, a], all in 0-255). */
    toRgbaArray(color: Color, out: WritableArrayLike<number>, offset: number) {
        const a255 = color >>> 24 & 255;
        const r = color >>> 16 & 255;
        const g = color >>> 8 & 255;
        const b = color & 255;
        out[offset] = r;
        out[offset + 1] = g;
        out[offset + 2] = b;
        out[offset + 3] = a255;
    },
    /** Save `color` in an array represented as RGB (i.e. triplet [r, g, b]), ignoring the opacity channel. */
    toRgbArray(color: Color, out: WritableArrayLike<number>, offset: number) {
        const r = color >>> 16 & 255;
        const g = color >>> 8 & 255;
        const b = color & 255;
        out[offset] = r;
        out[offset + 1] = g;
        out[offset + 2] = b;
    },
    /** Save `color` in an array represented as "ARaGaBa" (i.e. quadruplet [a*255, r*a, g*a, b*a]). This representation is useful for averaging colors, and can be stored in a Uint8ClampedArray. */
    toAragabaArray(color: Color, out: WritableArrayLike<number>, offset: number) {
        const a255 = (color >>> 24 & 255);
        const a = INV_ALPHA_SCALE * a255;
        const r = color >>> 16 & 255;
        const g = color >>> 8 & 255;
        const b = color & 255;
        out[offset] = a255;
        out[offset + 1] = r * a;
        out[offset + 2] = g * a;
        out[offset + 3] = b * a;
    },
    /** Add `color` to the current value in an array represented as "ARaGaBa" (i.e. quadruplet [a*255, r*a, g*a, b*a]). This representation is useful for averaging colors, and can be stored in a Uint8ClampedArray. */
    addToAragabaArray(color: Color, out: WritableArrayLike<number>, offset: number) {
        const a255 = (color >>> 24 & 255);
        const a = INV_ALPHA_SCALE * a255;
        const r = color >>> 16 & 255;
        const g = color >>> 8 & 255;
        const b = color & 255;
        out[offset] += a255;
        out[offset + 1] += r * a;
        out[offset + 2] += g * a;
        out[offset + 3] += b * a;
    },
    /** Set pixel `x,y` in `image` to `color` */
    toImage(color: Color, image: Image, x: number, y: number) {
        return this.toAragabaArray(color, image.items, 4 * (y * image.nColumns + x));
    },
    /** Add `color` to current value of pixel `x,y` in `image` */
    addToImage(color: Color, image: Image, x: number, y: number) {
        return this.addToAragabaArray(color, image.items, 4 * (y * image.nColumns + x));
    },
    /** Load color from an array represented as "ARaGaBa" (i.e. quadruplet [a*255, r*a, g*a, b*a]). This representation is useful for averaging colors, and can be stored in a Uint8ClampedArray. */
    fromAragabaArray(array: ArrayLike<number>, offset: number): Color {
        const a255 = array[offset];
        const invA = (a255 > 0) ? (ALPHA_SCALE / a255) : 0;
        const r = invA * array[offset + 1];
        const g = invA * array[offset + 2];
        const b = invA * array[offset + 3];
        return (a255 << 24 | r << 16 | g << 8 | b) as Color;
    },
    /** Load color from `Image`. */
    fromImage(image: Image, x: number, y: number): Color {
        return this.fromAragabaArray(image.items, 4 * (y * image.nColumns + x));
    },
    mix(color0: Color, color1: Color, q: number): Color {
        const a0 = color0 >>> 24 & 255;
        const r0 = color0 >>> 16 & 255;
        const g0 = color0 >>> 8 & 255;
        const b0 = color0 & 255;
        const a1 = color1 >>> 24 & 255;
        const r1 = color1 >>> 16 & 255;
        const g1 = color1 >>> 8 & 255;
        const b1 = color1 & 255;
        const a = (1 - q) * a0 + q * a1;
        const r = (1 - q) * r0 + q * r1;
        const g = (1 - q) * g0 + q * g1;
        const b = (1 - q) * b0 + q * b1;
        return (a << 24 | r << 16 | g << 8 | b) as Color;
    },
    scaleAlpha(color: Color, scale: number): Color {
        const oldA = color >>> 24 & 255;
        const newA = scale * oldA;
        return ((newA << 24) | (color & RGB_MASK)) as Color;
    },
};


/** Get hexadecimal value of a character with code `charCode`,
 * e.g. 48 ('0') -> 0, 65 ('A') -> 10, 97 ('a') -> 10. */
function hexValue(charCode: number): number {
    if (charCode < 65) return charCode - 48;
    if (charCode < 97) return charCode - 55;
    return charCode - 87;
}
/** Get character code of the hexadecimal digit representing `num` (0 <= num <=15). */
function hexDigitCode(num: number) {
    if (num <= 9) return 48 + num;
    else return 87 + num;
}


/** Use `| OPAQUE` to add full opacity to pure RGB */
const OPAQUE = ALPHA_SCALE << 24;

const RGB_MASK = (1 << 24) - 1;


/** X11 color names http://www.w3.org/TR/css3-color/#svg-color */
export const ColorNames: { [name: string]: Color } = {
    aliceblue: 0xf0f8ff | OPAQUE,
    antiquewhite: 0xfaebd7 | OPAQUE,
    aqua: 0x00ffff | OPAQUE,
    aquamarine: 0x7fffd4 | OPAQUE,
    azure: 0xf0ffff | OPAQUE,
    beige: 0xf5f5dc | OPAQUE,
    bisque: 0xffe4c4 | OPAQUE,
    black: 0x000000 | OPAQUE,
    blanchedalmond: 0xffebcd | OPAQUE,
    blue: 0x0000ff | OPAQUE,
    blueviolet: 0x8a2be2 | OPAQUE,
    brown: 0xa52a2a | OPAQUE,
    burlywood: 0xdeb887 | OPAQUE,
    cadetblue: 0x5f9ea0 | OPAQUE,
    chartreuse: 0x7fff00 | OPAQUE,
    chocolate: 0xd2691e | OPAQUE,
    coral: 0xff7f50 | OPAQUE,
    cornflower: 0x6495ed | OPAQUE,
    cornflowerblue: 0x6495ed | OPAQUE,
    cornsilk: 0xfff8dc | OPAQUE,
    crimson: 0xdc143c | OPAQUE,
    cyan: 0x00ffff | OPAQUE,
    darkblue: 0x00008b | OPAQUE,
    darkcyan: 0x008b8b | OPAQUE,
    darkgoldenrod: 0xb8860b | OPAQUE,
    darkgray: 0xa9a9a9 | OPAQUE,
    darkgreen: 0x006400 | OPAQUE,
    darkgrey: 0xa9a9a9 | OPAQUE,
    darkkhaki: 0xbdb76b | OPAQUE,
    darkmagenta: 0x8b008b | OPAQUE,
    darkolivegreen: 0x556b2f | OPAQUE,
    darkorange: 0xff8c00 | OPAQUE,
    darkorchid: 0x9932cc | OPAQUE,
    darkred: 0x8b0000 | OPAQUE,
    darksalmon: 0xe9967a | OPAQUE,
    darkseagreen: 0x8fbc8f | OPAQUE,
    darkslateblue: 0x483d8b | OPAQUE,
    darkslategray: 0x2f4f4f | OPAQUE,
    darkslategrey: 0x2f4f4f | OPAQUE,
    darkturquoise: 0x00ced1 | OPAQUE,
    darkviolet: 0x9400d3 | OPAQUE,
    deeppink: 0xff1493 | OPAQUE,
    deepskyblue: 0x00bfff | OPAQUE,
    dimgray: 0x696969 | OPAQUE,
    dimgrey: 0x696969 | OPAQUE,
    dodgerblue: 0x1e90ff | OPAQUE,
    firebrick: 0xb22222 | OPAQUE,
    floralwhite: 0xfffaf0 | OPAQUE,
    forestgreen: 0x228b22 | OPAQUE,
    fuchsia: 0xff00ff | OPAQUE,
    gainsboro: 0xdcdcdc | OPAQUE,
    ghostwhite: 0xf8f8ff | OPAQUE,
    gold: 0xffd700 | OPAQUE,
    goldenrod: 0xdaa520 | OPAQUE,
    gray: 0x808080 | OPAQUE,
    green: 0x008000 | OPAQUE,
    greenyellow: 0xadff2f | OPAQUE,
    grey: 0x808080 | OPAQUE,
    honeydew: 0xf0fff0 | OPAQUE,
    hotpink: 0xff69b4 | OPAQUE,
    indianred: 0xcd5c5c | OPAQUE,
    indigo: 0x4b0082 | OPAQUE,
    ivory: 0xfffff0 | OPAQUE,
    khaki: 0xf0e68c | OPAQUE,
    laserlemon: 0xffff54 | OPAQUE,
    lavender: 0xe6e6fa | OPAQUE,
    lavenderblush: 0xfff0f5 | OPAQUE,
    lawngreen: 0x7cfc00 | OPAQUE,
    lemonchiffon: 0xfffacd | OPAQUE,
    lightblue: 0xadd8e6 | OPAQUE,
    lightcoral: 0xf08080 | OPAQUE,
    lightcyan: 0xe0ffff | OPAQUE,
    lightgoldenrod: 0xfafad2 | OPAQUE,
    lightgoldenrodyellow: 0xfafad2 | OPAQUE,
    lightgray: 0xd3d3d3 | OPAQUE,
    lightgreen: 0x90ee90 | OPAQUE,
    lightgrey: 0xd3d3d3 | OPAQUE,
    lightpink: 0xffb6c1 | OPAQUE,
    lightsalmon: 0xffa07a | OPAQUE,
    lightseagreen: 0x20b2aa | OPAQUE,
    lightskyblue: 0x87cefa | OPAQUE,
    lightslategray: 0x778899 | OPAQUE,
    lightslategrey: 0x778899 | OPAQUE,
    lightsteelblue: 0xb0c4de | OPAQUE,
    lightyellow: 0xffffe0 | OPAQUE,
    lime: 0x00ff00 | OPAQUE,
    limegreen: 0x32cd32 | OPAQUE,
    linen: 0xfaf0e6 | OPAQUE,
    magenta: 0xff00ff | OPAQUE,
    maroon: 0x800000 | OPAQUE,
    maroon2: 0x7f0000 | OPAQUE,
    maroon3: 0xb03060 | OPAQUE,
    mediumaquamarine: 0x66cdaa | OPAQUE,
    mediumblue: 0x0000cd | OPAQUE,
    mediumorchid: 0xba55d3 | OPAQUE,
    mediumpurple: 0x9370db | OPAQUE,
    mediumseagreen: 0x3cb371 | OPAQUE,
    mediumslateblue: 0x7b68ee | OPAQUE,
    mediumspringgreen: 0x00fa9a | OPAQUE,
    mediumturquoise: 0x48d1cc | OPAQUE,
    mediumvioletred: 0xc71585 | OPAQUE,
    midnightblue: 0x191970 | OPAQUE,
    mintcream: 0xf5fffa | OPAQUE,
    mistyrose: 0xffe4e1 | OPAQUE,
    moccasin: 0xffe4b5 | OPAQUE,
    navajowhite: 0xffdead | OPAQUE,
    navy: 0x000080 | OPAQUE,
    oldlace: 0xfdf5e6 | OPAQUE,
    olive: 0x808000 | OPAQUE,
    olivedrab: 0x6b8e23 | OPAQUE,
    orange: 0xffa500 | OPAQUE,
    orangered: 0xff4500 | OPAQUE,
    orchid: 0xda70d6 | OPAQUE,
    palegoldenrod: 0xeee8aa | OPAQUE,
    palegreen: 0x98fb98 | OPAQUE,
    paleturquoise: 0xafeeee | OPAQUE,
    palevioletred: 0xdb7093 | OPAQUE,
    papayawhip: 0xffefd5 | OPAQUE,
    peachpuff: 0xffdab9 | OPAQUE,
    peru: 0xcd853f | OPAQUE,
    pink: 0xffc0cb | OPAQUE,
    plum: 0xdda0dd | OPAQUE,
    powderblue: 0xb0e0e6 | OPAQUE,
    purple: 0x800080 | OPAQUE,
    purple2: 0x7f007f | OPAQUE,
    purple3: 0xa020f0 | OPAQUE,
    rebeccapurple: 0x663399 | OPAQUE,
    red: 0xff0000 | OPAQUE,
    rosybrown: 0xbc8f8f | OPAQUE,
    royalblue: 0x4169e1 | OPAQUE,
    saddlebrown: 0x8b4513 | OPAQUE,
    salmon: 0xfa8072 | OPAQUE,
    sandybrown: 0xf4a460 | OPAQUE,
    seagreen: 0x2e8b57 | OPAQUE,
    seashell: 0xfff5ee | OPAQUE,
    sienna: 0xa0522d | OPAQUE,
    silver: 0xc0c0c0 | OPAQUE,
    skyblue: 0x87ceeb | OPAQUE,
    slateblue: 0x6a5acd | OPAQUE,
    slategray: 0x708090 | OPAQUE,
    slategrey: 0x708090 | OPAQUE,
    snow: 0xfffafa | OPAQUE,
    springgreen: 0x00ff7f | OPAQUE,
    steelblue: 0x4682b4 | OPAQUE,
    tan: 0xd2b48c | OPAQUE,
    teal: 0x008080 | OPAQUE,
    thistle: 0xd8bfd8 | OPAQUE,
    tomato: 0xff6347 | OPAQUE,
    turquoise: 0x40e0d0 | OPAQUE,
    violet: 0xee82ee | OPAQUE,
    wheat: 0xf5deb3 | OPAQUE,
    white: 0xffffff | OPAQUE,
    whitesmoke: 0xf5f5f5 | OPAQUE,
    yellow: 0xffff00 | OPAQUE,
    yellowgreen: 0x9acd32 | OPAQUE,
} as any;


export function benchmarkColor(str: string, n: number, m: number = 3) {
    const c1 = Color.fromString(str);
    const c3 = d3.rgb(str);
    console.log(str, c1, Color.toString(c1), c3, c3.formatHex8());

    for (let k = 0; k < m; k++) {
        console.time('fromString');
        for (let i = 0; i < n; i++) {
            Color.fromString(str);
        }
        console.timeEnd('fromString');
    }

    for (let k = 0; k < m; k++) {
        console.time('d3 from string');
        for (let i = 0; i < n; i++) {
            d3.rgb(str);
        }
        console.timeEnd('d3 from string');
    }

    for (let k = 0; k < m; k++) {
        const arr = [0, 0, 0, 0];
        console.time('toArray');
        for (let i = 0; i < n; i++) {
            Color.toRgbaArray(c1!, arr, 0);
        }
        console.timeEnd('toArray');
    }

    for (let k = 0; k < m; k++) {
        const { r, g, b, opacity } = c3;
        console.time('fromRgba');
        for (let i = 0; i < n; i++) {
            Color.fromRgba(r, g, b, opacity);
        }
        console.timeEnd('fromRgba');
    }

    for (let k = 0; k < m; k++) {
        console.time('toString');
        for (let i = 0; i < n; i++) {
            Color.toString(c1!);
        }
        console.timeEnd('toString');
    }
}


type KeysWith<T, V> = { [key in keyof T]: T[key] extends V ? key : never }[keyof T]
type RemovePrefix<P extends string, T> = T extends `${P}${infer S}` ? S : never
type D3ColorSchemeName = RemovePrefix<'interpolate', KeysWith<typeof d3, (t: number) => string>>


function createScaleFromColors(domain: number[], colors: (Color | string)[]) {
    if (domain.length !== colors.length) throw new Error('Domain and colors must have the same length');
    const n = domain.length;
    const theDomain = Domain.create(domain);
    const theColors = colors.map(c => typeof c === 'string' ? Color.fromString(c) : c);
    if (!theDomain.isNumeric || theDomain.sortDirection === 'none') {
        throw new Error('Provided domain is not numeric and monotonous');
    }
    return (x: number) => {
        const contIndex = clamp(Domain.interpolateIndex(theDomain, x)!, 0, n - 1);
        const index = Math.floor(contIndex);
        if (index === n) return theColors[n];
        else return Color.mix(theColors[index], theColors[index + 1], contIndex - index);
    };
}

function createScaleFromScheme(schemeName: D3ColorSchemeName, domain: [number, number] = [0, 1], range_: [number, number] = [0, 1]): ((x: number) => Color) {
    const colorInterpolator = d3[`interpolate${schemeName}`];
    const n = 100;
    const domSc = d3.scaleLinear([0, n], domain);
    const ranSc = d3.scaleLinear([0, n], range_);
    const dom = range(n + 1).map(i => domSc(i));
    const cols = range(n + 1).map(i => Color.fromString(colorInterpolator(ranSc(i))));
    return createScaleFromColors(dom, cols);
}

/** Create a color scale, e.g. `createColorScale('Magma', [0, 1], [0, 1])` or `createColorScale([0, 0.5, 1], ['white', 'orange', 'brown'])` */
export function createColorScale(schemeName: D3ColorSchemeName, domain?: [number, number], range?: [number, number]): ((x: number) => Color);
export function createColorScale(domain: number[], colors: (Color | string)[]): ((x: number) => Color);
export function createColorScale(a: D3ColorSchemeName | number[], b?: any, c?: any): ((x: number) => Color) {
    if (typeof a === 'string') return createScaleFromScheme(a, b, c);
    else return createScaleFromColors(a, b);
}
