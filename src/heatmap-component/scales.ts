import { clamp } from 'lodash';
import * as d3 from './d3-modules';


/** Represents a point in 2D */
export interface XY { x: number, y: number }

/** Represents a rectangle in 2D (with sides parallel to X and Y axes) */
export interface Box { readonly xmin: number, readonly ymin: number, readonly xmax: number, readonly ymax: number }

export const Box = {
    /** Return a newly created `Box` */
    create(xmin: number, ymin: number, xmax: number, ymax: number): Box {
        return { xmin, ymin, xmax, ymax };
    },
    /** Return width of a `Box` */
    width(box: Box): number {
        return box.xmax - box.xmin;
    },
    /** Return height of a `Box` */
    height(box: Box): number {
        return box.ymax - box.ymin;
    },
    /** Decide whether a 2D point is within a `Box` (including its boundary) */
    containsPoint(box: Box, point: XY): boolean {
        return point.x >= box.xmin && point.x <= box.xmax && point.y >= box.ymin && point.y <= box.ymax;
    },
    /** Return the portion of `box` which lies within `constraint` box.
     * If `minSize` is provided, expand the resulting box to ensure minimum box size (unless it completely fills the `constraint` box). */
    clamp(box: Box, constraint: Box, minSize?: BoxSize): Box {
        const clamped: Box = {
            xmin: isNaN(box.xmin) ? constraint.xmin : clamp(box.xmin, constraint.xmin, constraint.xmax),
            xmax: isNaN(box.xmax) ? constraint.xmax : clamp(box.xmax, constraint.xmin, constraint.xmax),
            ymin: isNaN(box.ymin) ? constraint.ymin : clamp(box.ymin, constraint.ymin, constraint.ymax),
            ymax: isNaN(box.ymax) ? constraint.ymax : clamp(box.ymax, constraint.ymin, constraint.ymax),
        };
        if (minSize === undefined) {
            return clamped;
        } else {
            return expandBox(clamped, constraint, minSize);
        }
    },
    /** Snap box boundaries to integer values.
     * If snapStrategy==='out', move boundaries outwards;
     * if snapStrategy==='nearest', round boundaries to nearest integers.
     * If `constraints` is provided, clamp resulting box to `constraints`.
     * Return `undefined` if resulting box collapses to zero-width or zero-height. */
    snap(box: Box | undefined, snapStrategy: 'out' | 'nearest', constraints?: Box): Box | undefined {
        if (!box) return undefined;

        let snapped: Box = snapStrategy === 'out' ? {
            // Snap out
            xmin: Math.floor(box.xmin),
            xmax: Math.ceil(box.xmax),
            ymin: Math.floor(box.ymin),
            ymax: Math.ceil(box.ymax),
        } : {
            // Snap to nearest boundary
            xmin: Math.round(box.xmin),
            xmax: Math.round(box.xmax),
            ymin: Math.round(box.ymin),
            ymax: Math.round(box.ymax),
        };
        if (constraints) {
            snapped = Box.clamp(snapped, constraints);
        }
        if (snapped.xmin === snapped.xmax || snapped.ymin === snapped.ymax) {
            // Empty box
            return undefined;
        }
        return snapped;
    },
};

/** Represents an interval on real numbers */
type Interval = [min: number, max: number]

/** Expand `interval` to ensure minimum width, but do not expand out of the `constraint` interval.
 * (Resulting interval will be smaller that `minWidth` if it completely fills the `constraint` interval.) */
function expandInterval(interval: Interval, constraint: Interval, minWidth: number = 0): Interval {
    const [min, max] = interval;
    const [constraintMin, constraintMax] = constraint;
    if (max - min >= minWidth) {
        // Already wide enough
        return [min, max];
    }
    const center = 0.5 * (min + max);
    if (center < constraintMin + 0.5 * minWidth) {
        // Will touch constraintMin
        return [constraintMin, Math.min(constraintMin + minWidth, constraintMax)];
    }
    if (center > constraintMax - 0.5 * minWidth) {
        // Will touch constraintMax
        return [Math.max(constraintMax - minWidth, constraintMin), constraintMax];
    }
    return [center - 0.5 * minWidth, center + 0.5 * minWidth];
}

/** Expand `box` to ensure minimum box size, but do not expand out of the `constraint` box.
 * (Resulting box will be smaller that `minSize` if it completely fills the `constraint` box in either direction.) */
function expandBox(box: Box, constraint: Box, minSize: BoxSize): Box {
    const [xmin, xmax] = expandInterval([box.xmin, box.xmax], [constraint.xmin, constraint.xmax], minSize.width);
    const [ymin, ymax] = expandInterval([box.ymin, box.ymax], [constraint.ymin, constraint.ymax], minSize.height);
    return { xmin, xmax, ymin, ymax };
}

/** Represents size of a 2D box */
export interface BoxSize { width: number, height: number }


/** Boxes that need to be remembered by a heatmap to implement zoom transformation and related stuf. */
export interface Boxes {
    /** The whole "world" (where the data live), measured as number of columns/rows */
    wholeWorld: Box,
    /** Part of the world which maps to the viewport */
    visWorld: Box,
    /** Viewport in the canvas coordinates (starts at [0,0]), measured in pixels.
     * These coordinates can be used both for interactivity via DOM events and for drawing via canvas context,
     * because the logical size of the canvas is synchronized with its DOM size. */
    canvas: Box,
}

/** Pair of scales for X and Y coordinates */
interface XYScale {
    /** Scale for X coordinates */
    x: d3.ScaleLinear<number, number>,
    /** Scale for Y coordinates */
    y: d3.ScaleLinear<number, number>,
}

/** Scales needed to implement zoom transformation and related stuff */
export interface Scales {
    /** Scale from world coordinates to canvas coordinates */
    worldToCanvas: XYScale,
    /** Scale from canvas coordinates to world coordinates */
    canvasToWorld: XYScale,
}

function getXScale(source: Box, dest: Box): d3.ScaleLinear<number, number> {
    return d3.scaleLinear([source.xmin, source.xmax], [dest.xmin, dest.xmax]).clamp(false);
}
function getYScale(source: Box, dest: Box): d3.ScaleLinear<number, number> {
    return d3.scaleLinear([source.ymin, source.ymax], [dest.ymin, dest.ymax]).clamp(false);
}

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

/** Apply scale to a distance of two points */
export function scaleDistance(scale: d3.ScaleLinear<number, number>, distance: number): number {
    if (scale.clamp()) throw new Error('NotImplementedError: this function is not implemented for clamping scales');
    return scale(distance) - scale(0);
}
