import { isEqual, isNil } from 'lodash';
import { BehaviorSubject } from 'rxjs';
import { BoxSize } from './scales';


export async function sleep(ms: number) {
    await new Promise(resolve => setTimeout(resolve, ms));
}

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
