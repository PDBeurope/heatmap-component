import * as d3 from 'd3';


export interface Box { xmin: number, ymin: number, xmax: number, ymax: number }

export const Box = {
    create(xmin: number, ymin: number, xmax: number, ymax: number): Box {
        return { xmin, ymin, xmax, ymax };
    },
    width(box: Box): number {
        return box.xmax - box.xmin;
    },
    height(box: Box): number {
        return box.ymax - box.ymin;
    },
};

export interface BoxSize { width: number, height: number }


export interface Boxes {
    /** Part of the "world" (where the data live) which maps to the viewport */
    visWorld: Box,
    /** The whole world (~ maximum zoom-out) */
    wholeWorld: Box,
    /** Viewport in DOM coordinates (starts at [0,0]) */
    dom: Box,
    /** Viewport in the canvas coordinates (starts at [0,0]) */
    canvas: Box,
}

interface XYScale {
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
}

export interface Scales {
    worldToDom: XYScale,
    domToWorld: XYScale,
    worldToCanvas: XYScale,
    canvasToWorld: XYScale,
    domToCanvas: XYScale,
    canvasToDom: XYScale,
}

function getXScale(source: Box, dest: Box) { return d3.scaleLinear([source.xmin, source.xmax], [dest.xmin, dest.xmax]).clamp(false); }
function getYScale(source: Box, dest: Box) { return d3.scaleLinear([source.ymin, source.ymax], [dest.ymin, dest.ymax]).clamp(false); }

export function Scales(boxes: Boxes): Scales {
    return {
        worldToDom: {
            x: getXScale(boxes.visWorld, boxes.dom),
            y: getYScale(boxes.visWorld, boxes.dom),
        },
        domToWorld: {
            x: getXScale(boxes.dom, boxes.visWorld),
            y: getYScale(boxes.dom, boxes.visWorld),
        },
        worldToCanvas: {
            x: getXScale(boxes.visWorld, boxes.canvas),
            y: getYScale(boxes.visWorld, boxes.canvas),
        },
        canvasToWorld: {
            x: getXScale(boxes.canvas, boxes.visWorld),
            y: getYScale(boxes.canvas, boxes.visWorld),
        },
        domToCanvas: {
            x: getXScale(boxes.dom, boxes.canvas),
            y: getYScale(boxes.dom, boxes.canvas),
        },
        canvasToDom: {
            x: getXScale(boxes.canvas, boxes.dom),
            y: getYScale(boxes.canvas, boxes.dom),
        },
    };
}

export function scaleDistance(scale: d3.ScaleLinear<number, number>, distance: number): number {
    if (scale.clamp()) throw new Error('NotImplementedError: this function is not implemented for clamping scales');
    return scale(distance) - scale(0);
}
