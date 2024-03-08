import { clamp, sortedIndex, sortedIndexBy } from 'lodash';
import { IsNumeric, sortDirection } from './utils';

export interface Domain<T> {
    values: T[],
    index: Map<T, number>,
    isNumeric: IsNumeric<T>,
    sortDirection: 'asc' | 'desc' | 'none',
}

export const Domain = {
    create<T>(values: T[]): Domain<T> {
        const isNumeric = values.every(v => typeof v === 'number') as IsNumeric<T>;
        return {
            values,
            isNumeric,
            sortDirection: isNumeric ? sortDirection(values as number[]) : 'none',
            index: new Map(values.map((v, i) => [v, i])), // TODO avoid creating array of arrays
        };
    },

    /** For numeric domain:
     * return `domain.values[index]` if `index` is an integer within [0, domain.values.length);
     * interpolate/extrapolate if `index` is non-integer number or out of range.
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
        } else {
            return _getIndexWithInterpolation(domain as Domain<number>, value as number);
        }
    },
};


function _getIndexWithInterpolation(domain: Domain<number>, value: number): number | undefined {
    if (domain.sortDirection === 'none') {
        console.warn('Cannot interpolate index because the domain is not sorted');
        return undefined;
    }
    let nextIndex = domain.sortDirection === 'asc' ? sortedIndex(domain.values, value) : sortedIndexBy(domain.values, value, v => -v);
    nextIndex = clamp(nextIndex, 1, domain.values.length - 1);
    const previousIndex = nextIndex - 1;
    const previousValue = domain.values[previousIndex];
    const nextValue = domain.values[nextIndex];
    return (value - previousValue) / (nextValue - previousValue) + previousIndex;
};
