import { clamp, sortedIndex, sortedIndexBy } from 'lodash';
import { IsNumeric, isNumericArray, sortDirection } from '../utils';


/** Represents a list of values corresponding to X (columns) or Y (rows) coordinates in a heatmap */
export interface Domain<T> {
    /** Values in the domain */
    values: T[],
    /** Mapping of values to their index in the domain (i.e. column or row index) */
    index: Map<T, number>,
    /** Flags whether all values within the domain are numbers */
    isNumeric: IsNumeric<T>,
    /** Flags whether the values in the domain are sorted (strictly ascending or strictly descending) */
    sortDirection: 'asc' | 'desc' | 'none',
}

export const Domain = {
    /** Create a `Domain` object with given values. */
    create<T>(values: T[]): Domain<T> {
        const isNumeric = isNumericArray(values);
        return {
            values,
            isNumeric,
            sortDirection: isNumeric ? sortDirection(values as number[]) : 'none',
            index: createIndex(values),
        };
    },

    /** For numeric domain: convert index to value, i.e.
     * return `index`-th value of the domain if `index` is an integer within [0, domain.values.length);
     * interpolate/extrapolate if `index` is a non-integer number or out of range.
     * For non-numeric domain: always return `undefined`. */
    interpolateValue<T>(domain: Domain<T>, index: number): T extends number ? number : undefined {
        if (domain.isNumeric) {
            const values = domain.values as unknown as number[];
            const previousIndex = clamp(Math.floor(index), 0, values.length - 2);
            const nextIndex = previousIndex + 1;
            const previousValue = values[previousIndex];
            const nextValue = values[nextIndex];
            return (index - previousIndex) * (nextValue - previousValue) + previousValue as any;
        } else {
            return undefined as any;
        }
    },

    /** Convert domain value to index, using interpolation. Return `undefined` for domains that are not numeric or not strictly sorted. */
    interpolateIndex<T>(domain: Domain<T>, value: T): number | undefined {
        if (!domain.isNumeric) {
            console.warn('Cannot interpolate index because the domain is not numeric');
            return undefined;
        }
        if (typeof value !== 'number') {
            console.warn('Cannot interpolate index because the value is not numeric');
            return undefined;
        }
        const { sortDirection, values } = domain as Domain<number>;
        if (sortDirection === 'none') {
            console.warn('Cannot interpolate index because the domain is not sorted');
            return undefined;
        }
        let nextIndex = (sortDirection === 'asc') ? sortedIndex(values, value) : sortedIndexBy(values, value, v => -v);
        nextIndex = clamp(nextIndex, 1, values.length - 1);
        const previousIndex = nextIndex - 1;
        const previousValue = values[previousIndex];
        const nextValue = values[nextIndex];
        return (value - previousValue) / (nextValue - previousValue) + previousIndex;
    },
};

/** Create a mapping of values to their index in the array */
function createIndex<T>(values: T[]): Map<T, number> {
    const map = new Map<T, number>();
    const n = values.length;
    for (let i = 0; i < n; i++) {
        map.set(values[i], i);
    }
    return map;
}
