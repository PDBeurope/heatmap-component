import { clamp, isArray, range, uniq } from 'lodash';
import * as d3 from '../d3-modules';
import { Color } from './color';
import { Domain } from './domain';


/** Keys of type `T` whose value is assignable `V` */
type KeysWith<T, V> = { [key in keyof T]: T[key] extends V ? key : never }[keyof T]
/** Remove prefix `P` from a string literal type, remove literals that do not starts with the prefix */
type RemovePrefix<P extends string, T> = T extends `${P}${infer S}` ? S : never

/** Set of continuous D3 color scheme names */
type D3ContinuousSchemeName = RemovePrefix<'interpolate', KeysWith<typeof d3, (t: number) => string>>
/** Set of categorical D3 color scheme names */
type D3CategoricalSchemeName = RemovePrefix<'scheme', KeysWith<typeof d3, readonly string[]>>
/** Set of all D3 color scheme names */
type D3SchemeName = D3ContinuousSchemeName | D3CategoricalSchemeName

/** List of names of available continuous color schemes */
const D3ContinuousSchemes = Object.keys(d3).filter(k => k.indexOf('interpolate') === 0).map(k => k.replace(/^interpolate/, '')) as D3ContinuousSchemeName[];
/** List of names of available categorical color schemes */
const D3CategoricalSchemes = Object.keys(d3).filter(k => k.indexOf('scheme') === 0 && isStringArray((d3 as any)[k])).map(k => k.replace(/^scheme/, '')) as D3CategoricalSchemeName[];
/** List of names of all available color schemes */
const D3Schemes = uniq([...D3ContinuousSchemes, ...D3CategoricalSchemes]).sort() as D3SchemeName[];


export type ContinuousColorScale = (x: number) => Color
export type DiscreteColorScale<T> = (x: T) => Color


function continuousScaleFromColors(values: number[], colors: (Color | string)[]): ContinuousColorScale {
    if (values.length !== colors.length) throw new Error('`values` and `colors` must have the same length');
    const n = values.length;
    const theDomain = Domain.create(values);
    const theColors = colors.map(c => typeof c === 'string' ? Color.fromString(c) : c);
    if (!theDomain.isNumeric || theDomain.sortDirection === 'none') {
        throw new Error('Provided list of `values` is not numeric and monotonous');
    }
    function colorScale(x: number): Color {
        const contIndex = clamp(Domain.interpolateIndex(theDomain, x)!, 0, n - 1);
        const index = Math.floor(contIndex);
        if (index === n) return theColors[n];
        else return Color.mix(theColors[index], theColors[index + 1], contIndex - index);
    };
    return colorScale;
}

function continuousScaleFromScheme(schemeName: D3ContinuousSchemeName, domain: [number, number] = [0, 1], range_: [number, number] = [0, 1]): ContinuousColorScale {
    const colorInterpolator = d3[`interpolate${schemeName as D3ContinuousSchemeName}`];
    if (colorInterpolator !== undefined) {
        const n = 101;
        const values = linspace(domain, n);
        const colors = colorsFromInterpolator(colorInterpolator, range_, n);
        return continuousScaleFromColors(values, colors);
    }

    throw new Error(`Invalid color scheme name: "${schemeName}".\n(Available schemes: ${ColorScale.ContinuousSchemes})`);
}

/** Create a continuous color scale based on a named scheme,
 * e.g. `continuous('Magma', [0, 1], [0, 1])`.
 * `schemeName` is the name of the used scheme (list available from `ColorScale.ContinuousSchemes`).
 * `domain` is the range of numbers that maps to the colors in the scheme: `domain[0]` maps to the first color in the scheme, `domain[1]` to the last color (default domain is [0, 1]).
 * `range` can be used to select only a section of the whole scheme, e.g. [0, 0.5] uses only the first half of the scheme, [1, 0] reverses the scheme direction. */
function continuous(schemeName: D3ContinuousSchemeName, domain: [number, number], range?: [number, number]): ContinuousColorScale;
/** Create a continuous color scale based on a list of numeric values and a list of colors mapped to these values, interpolating inbetween,
 * e.g. `continuous([0, 0.5, 1], ['white', 'orange', 'brown'])`.
 * `values` must be either ascending or descending. */
function continuous(values: number[], colors: (Color | string)[]): ContinuousColorScale;
function continuous(a: D3ContinuousSchemeName | number[], b?: any, c?: any): ContinuousColorScale {
    if (typeof a === 'string') return continuousScaleFromScheme(a, b, c);
    else return continuousScaleFromColors(a, b);
}


function discreteScaleFromColors<T>(values: T[], colors: (Color | string)[], unknownColor: Color | string = '#888888'): DiscreteColorScale<T> {
    if (values.length !== colors.length) throw new Error('`values` and `colors` must have the same length');
    const n = values.length;
    const map = new Map<T, Color>();
    for (let i = 0; i < n; i++) {
        const color = colors[i];
        map.set(values[i], (typeof color === 'string') ? Color.fromString(color) : color);
    }
    const fallbackColor = (typeof unknownColor === 'string') ? Color.fromString(unknownColor) : unknownColor;
    function discreteColorScale(x: T): Color {
        return map.get(x) ?? fallbackColor;
    };
    return discreteColorScale;
}

function discreteScaleFromScheme<T>(schemeName: D3SchemeName, values: T[], unknownColor?: Color | string): DiscreteColorScale<T> {
    const scheme = d3[`scheme${schemeName as D3CategoricalSchemeName}`];
    if (isStringArray(scheme)) {
        const colorList = scheme.map(s => Color.fromString(s));
        return discreteScaleFromColors(values, cycle(colorList, values.length), unknownColor);
    }
    const colorInterpolator = d3[`interpolate${schemeName as D3ContinuousSchemeName}`];
    if (colorInterpolator !== undefined) {
        const n = values.length;
        const colors = colorsFromInterpolator(colorInterpolator, [0, 1], n);
        return discreteScaleFromColors(values, colors, unknownColor);
    }

    throw new Error(`Invalid color scheme name: "${schemeName}".\n(Available schemes: ${ColorScale.DiscreteSchemes})`);
}

/** Create a discrete (categorical) color scale based on a named scheme,
 * e.g. `discrete('Set1', ['dog', 'cat', 'fish'], 'gray')`.
 * `schemeName` is the name of the used scheme (list available from `ColorScale.DiscreteSchemes`).
 * `values` is the set of values (of any type) that map to the colors in the scheme.
 * `unknownColor` parameter is the color that will be used for any value not present in `values`. */
function discrete<T>(schemeName: D3SchemeName, values: T[], unknownColor?: Color | string): DiscreteColorScale<T>;
/** Create a discrete (categorical) color scale based on a list of values (of any type) and a list of colors mapped to these values,
 * e.g. `discrete(['dog', 'cat', 'fish'], ['red', 'green', 'blue'], 'gray')`.
 * `unknownColor` parameter is the color that will be used for any value not present in `values`. */
function discrete<T>(values: T[], colors: (Color | string)[], unknownColor?: Color | string): DiscreteColorScale<T>;
function discrete<T>(a: D3SchemeName | T[], b: any, c: any): DiscreteColorScale<T> {
    if (typeof a === 'string') return discreteScaleFromScheme(a, b, c);
    else return discreteScaleFromColors(a, b, c);
}


function linspace(range_: [number, number], n: number): number[] {
    const scale = d3.scaleLinear([0, n - 1], range_);
    return range(n).map(i => scale(i));
}
function colorsFromInterpolator(colorInterpolator: (t: number) => string, range_: [number, number], nColors: number): Color[] {
    return linspace(range_, nColors).map(x => Color.fromString(colorInterpolator(x)));
}
function isStringArray(value: any): value is string[] {
    return isArray(value) && value.length > 0 && typeof (value[0]) === 'string';
}
function cycle<T>(source: T[], n: number): T[] {
    const result = [];
    while (result.length < n) {
        result.push(...source);
    }
    result.length = n;
    return result;
}


/** Functions for creating color scales to be used with heatmap. */
export const ColorScale = {
    /** List of available color schemes for `ColorScale.continuous()` */
    ContinuousSchemes: D3ContinuousSchemes, // continuous can only be used with continuous D3 schemes

    /** List of available color schemes for `ColorScale.discrete()` */
    DiscreteSchemes: D3Schemes, // discrete can be used with both categorical and continuous D3 schemes

    /** Create a continuous color scale, i.e. a mapping from real number to color.
     * Examples:
     * ```
     * continuous('Magma', [0, 1], [0, 1])
     * continuous([0, 0.5, 1], ['white', 'orange', 'brown'])
     * ``` */
    continuous,

    /** Create a discrete (categorical) color scale, i.e. a mapping from values of any type to colors.
     * Examples:
     * ```
     * discrete('Set1', ['dog', 'cat', 'fish'], 'gray')
     * discrete(['dog', 'cat', 'fish'], ['red', 'green', 'blue'], 'gray')
     * ``` */
    discrete,
};
