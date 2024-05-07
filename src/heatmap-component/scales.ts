import { clamp } from 'lodash';
import * as d3 from './d3-modules';


export interface XY { x: number, y: number }

export interface Box { readonly xmin: number, readonly ymin: number, readonly xmax: number, readonly ymax: number }

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
    containsPoint(box: Box, point: XY): boolean {
        return point.x >= box.xmin && point.x <= box.xmax && point.y >= box.ymin && point.y <= box.ymax;
    },
    clamp(box: Box, constraint: Box, minWidth: number = 0, minHeight: number = 0) {
        const xmin = isNaN(box.xmin) ? constraint.xmin : clamp(box.xmin, constraint.xmin, constraint.xmax - minWidth);
        const xmax = isNaN(box.xmax) ? constraint.xmax : clamp(box.xmax, xmin + minWidth, constraint.xmax);
        const ymin = isNaN(box.ymin) ? constraint.ymin : clamp(box.ymin, constraint.ymin, constraint.ymax - minHeight);
        const ymax = isNaN(box.ymax) ? constraint.ymax : clamp(box.ymax, ymin + minHeight, constraint.ymax);
        return Box.create(xmin, ymin, xmax, ymax);
    },
};

export interface BoxSize { width: number, height: number }


export interface Boxes {
    /** The whole "world" (where the data live) */
    wholeWorld: Box,
    /** Part of the world which maps to the viewport */
    visWorld: Box,
    /** Viewport in the canvas coordinates (starts at [0,0]).
     * These coordinates can be used both for interactivity via DOM events and for drawing via canvas context,
     * because the logical size of the canvas is synchronized with its DOM size. */
    canvas: Box,
}

interface XYScale {
    x: d3.ScaleLinear<number, number>,
    y: d3.ScaleLinear<number, number>,
}

export interface Scales {
    worldToCanvas: XYScale,
    canvasToWorld: XYScale,
}

function getXScale(source: Box, dest: Box) { return d3.scaleLinear([source.xmin, source.xmax], [dest.xmin, dest.xmax]).clamp(false); }
function getYScale(source: Box, dest: Box) { return d3.scaleLinear([source.ymin, source.ymax], [dest.ymin, dest.ymax]).clamp(false); }

export function Scales(boxes: Boxes): Scales {
    return {
        worldToCanvas: {
            x: getXScale(boxes.visWorld, boxes.canvas),
            y: getYScale(boxes.visWorld, boxes.canvas),
        },
        canvasToWorld: {
            x: getXScale(boxes.canvas, boxes.visWorld),
            y: getYScale(boxes.canvas, boxes.visWorld),
        },
    };
}

export function scaleDistance(scale: d3.ScaleLinear<number, number>, distance: number): number {
    if (scale.clamp()) throw new Error('NotImplementedError: this function is not implemented for clamping scales');
    return scale(distance) - scale(0);
}
