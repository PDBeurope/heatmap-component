import { clamp, range } from 'lodash';
import * as d3 from '../d3-modules';
import { Color } from './color';
import { Domain } from './domain';


/** Keys of type `T` whose value is assignable `V` */
type KeysWith<T, V> = { [key in keyof T]: T[key] extends V ? key : never }[keyof T]
/** Remove prefix `P` from a string literal type, remove literals that do not starts with the prefix */
type RemovePrefix<P extends string, T> = T extends `${P}${infer S}` ? S : never

/** Set of continuous D3 color scheme names */
type D3ContinuousSchemeName = RemovePrefix<'interpolate', KeysWith<typeof d3, (t: number) => string>>
// /** Set of categorical D3 color scheme names */
// type D3CategoricalSchemeName = RemovePrefix<'scheme', KeysWith<typeof d3, readonly string[]>>

/** List of names of available color schemes */
const AvailableSchemes = Object.keys(d3).filter(k => k.indexOf('interpolate') === 0).map(k => k.replace(/^interpolate/, '')) as D3ContinuousSchemeName[];
// const AllSchemes = Object.keys(d3).filter(k => k.indexOf('scheme') === 0).map(k => k.replace(/^scheme/, '')) as D3ContinuousSchemeName[];// TODO: type

export type ColorScale = (x: number) => Color

function createScaleFromColors(values: number[], colors: (Color | string)[]): ColorScale {
    if (values.length !== colors.length) throw new Error('`values` and `colors` must have the same length');
    const n = values.length;
    const theDomain = Domain.create(values);
    const theColors = colors.map(c => typeof c === 'string' ? Color.fromString(c) : c);
    if (!theDomain.isNumeric || theDomain.sortDirection === 'none') {
        throw new Error('Provided list of `values` is not numeric and monotonous');
    }
    return (x: number) => {
        const contIndex = clamp(Domain.interpolateIndex(theDomain, x)!, 0, n - 1);
        const index = Math.floor(contIndex);
        if (index === n) return theColors[n];
        else return Color.mix(theColors[index], theColors[index + 1], contIndex - index);
    };
}

function createScaleFromScheme(schemeName: D3ContinuousSchemeName, domain: [number, number] = [0, 1], range_: [number, number] = [0, 1]): ColorScale {
    const colorInterpolator = d3[`interpolate${schemeName}`];
    if (!colorInterpolator) {
        const schemes = Object.keys(d3).filter(k => k.indexOf('interpolate') === 0).map(k => k.replace(/^interpolate/, ''));
        throw new Error(`Invalid color scheme name: "${schemeName}".\n(Available schemes: ${schemes})`);
    }
    const n = 101;
    const domainScale = d3.scaleLinear([0, n - 1], domain);
    const values = range(n).map(i => domainScale(i));
    const colors = colorsFromInterpolator(colorInterpolator, range_, n);
    return createScaleFromColors(values, colors);
}

function colorsFromInterpolator(colorInterpolator: (t: number) => string, range_: [number, number], nColors: number): Color[] {
    const rangeScale = d3.scaleLinear([0, nColors - 1], range_);
    return range(nColors).map(i => Color.fromString(colorInterpolator(rangeScale(i))));
}




/** Create a continuous color scale based on a named scheme,
 * e.g. `continuous('Magma', [0, 1], [0, 1])`.
 * `schemeName` is the name of the used scheme (list available from `ColorScale.AvailableSchemes`).
 * `domain` is the range of numbers that maps to the colors in the scheme: `domain[0]` maps to the first color in the scheme, `domain[1]` to the last color (default domain is [0, 1]).
 * `range` can be used to select only a section of the whole scheme, e.g. [0, 0.5] uses only the first half of the scheme, [1, 0] reverses the scheme direction. */
function continuous(schemeName: D3ContinuousSchemeName, domain: [number, number], range?: [number, number]): ColorScale;

/** Create a continuous color scale based on a list of numeric values and a list of colors mapped to these values, interpolating inbetween,
 * e.g. `continuous([0, 0.5, 1], ['white', 'orange', 'brown'])`.
 * `values` must be either ascending or descending. */
function continuous(values: number[], colors: (Color | string)[]): ColorScale;

function continuous(a: D3ContinuousSchemeName | number[], b?: any, c?: any): ColorScale {
    if (typeof a === 'string') return createScaleFromScheme(a, b, c);
    else return createScaleFromColors(a, b);
}


export const ColorScale = {
    /** List of names of available color schemes */
    AvailableSchemes,
    // AllSchemes,

    /** Create a continuous color scale, i.e. a mapping from real number to color.
     * Examples:
     * ```
     * continuous('Magma', [0, 1], [0, 1])
     * continuous([0, 0.5, 1], ['white', 'orange', 'brown'])
     * ``` */
    continuous: continuous,
};
