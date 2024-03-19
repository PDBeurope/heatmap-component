import { isEqual, isNil } from 'lodash';
import { BehaviorSubject } from 'rxjs';
import * as d3 from './d3-modules';
import { BoxSize } from './scales';


/** `true` if type `T` is number, `false` for any other type */
export type IsNumeric<T> = T extends number ? true : false;

export async function sleep(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

/** Return size of a DOM element `selection` */
export function getSize(selection: AnySelection): BoxSize {
    const { width, height } = selection.node()!.getBoundingClientRect();
    return { width, height };
}

export type AnySelection = d3.Selection<any, any, any, any>

export function attrd<S extends AnySelection>(selection: S, attributes: Record<string, any> & { style?: Record<string, any> }): S {
    for (const name in attributes) {
        if (name !== 'style') selection.attr(kebabCase(name), attributes[name]);
    }
    for (const styleName in attributes.style) {
        selection.style(kebabCase(styleName), attributes.style[styleName]);
    }
    return selection;
}
export function kebabCase(str: string) {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/** Emit a new value for `subject`, unless it is equal to the current value */
export function nextIfChanged<T>(subject: BehaviorSubject<T>, newValue: T, key: ((value: T) => any) = (v => v)) {
    if (!isEqual(key(subject.getValue()), key(newValue))) {
        subject.next(newValue);
    }
}

/** Return the smallest of the given numbers. Ignore any nullish values. If all values are nullish, return `undefined`. */
export function minimum(...values: (number | null | undefined)[]): number | undefined {
    const definedValues = values.filter(x => !isNil(x)) as number[];
    if (definedValues.length > 0) return Math.min(...definedValues);
    else return undefined;
}

/** Return 'asc' if values in array are strictly ascending.
 *  Return 'desc' if values in array are strictly descending.
 *  Return 'none' otherwise, or if array has fewer than 2 elements. */
export function sortDirection(array: number[]): 'asc' | 'desc' | 'none' {
    const n = array.length;
    if (n < 2) return 'none';
    const direction = (array[0] < array[1]) ? 'asc' : 'desc';
    if (direction === 'asc') {
        for (let i = 1; i < n; i++) {
            if (array[i - 1] >= array[i]) return 'none';
        }
        return 'asc';
    } else {
        for (let i = 1; i < n; i++) {
            if (array[i - 1] <= array[i]) return 'none';
        }
        return 'desc';
    }
}

/** Run `f()` and return its running time in ms */
export function runWithTiming(f: () => any) {
    const start = Date.now();
    f();
    const end = Date.now();
    return end - start;
}

export function formatDataItem(item: any): string {
    if (typeof item === 'number') return item.toFixed(3);
    else return JSON.stringify(item);
}

/** Helper for running potentially time-consuming "refresh" actions (e.g. canvas draw) in a non-blocking way.
 * If the caller calls `requestRefresh()`, this call returns immediately but it is guaranteed
 * that `refresh` will be run asynchronously in the future.
 * However, if the caller calls `requestRefresh()` multiple times, it is NOT guaranteed
 * that `refresh` will be run the same number of times, only that it will be run
 * at least once after the last call to `requestRefresh()`. */
export function Refresher(refresh: () => any) {
    let requested = false;
    let running = false;
    function requestRefresh() {
        requested = true;
        if (!running) {
            handleRequests(); // do not await
        }
    }
    async function handleRequests() {
        while (requested) {
            requested = false;
            running = true;
            await sleep(0); // let other things happen (this pushes the rest of the function to the end of the queue)
            try {
                refresh();
            } catch (err) {
                console.error(err);
            }
            running = false;
        }
    }
    return {
        requestRefresh,
    };
}

/** Remove specific `element` from `array` if present, in place.
 * (Doesn't handle multiple occurrences of the same element.) */
export function removeElement<T>(array: T[], element: T): void {
    const i = array.indexOf(element);
    if (i >= 0) array.splice(i);
}

export function shallowMerge<T>(old: T, new_?: Partial<T>): T {
    return { ...old, ...new_ }; // TODO ignore udefineds in new_?
}
