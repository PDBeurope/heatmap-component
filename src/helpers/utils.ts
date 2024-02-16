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

