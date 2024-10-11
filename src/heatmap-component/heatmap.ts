import { Color } from './data/color';
import { DataDescription, Provider } from './data/data-description';
import { Behavior } from './extension';
import { BrushExtension, BrushExtensionParams } from './extensions/brush';
import { DrawExtension, DrawExtensionParams } from './extensions/draw';
import { MarkerBehavior, MarkerExtension, MarkerExtensionParams } from './extensions/marker';
import { DefaultTooltipExtensionParams, TooltipExtension, TooltipExtensionParams } from './extensions/tooltip';
import { ZoomExtension, ZoomExtensionParams } from './extensions/zoom';
import { HeatmapCore } from './heatmap-core';
import { XAlignmentMode, YAlignmentMode, ZoomEventValue } from './state';


/** Main class of the `heatmap-component` package.
 * Extends `HeatmapCore` by registering essential extensions and implementing useful public methods. */
export class Heatmap<TX, TY, TDatum> extends HeatmapCore<TX, TY, TDatum> {
    /** Custom events fired by the heatmap component, all are RxJS `BehaviorSubject` */
    get events() { return this.state.events; }

    /** Essential extension behaviors */
    readonly extensions: {
        marker?: Behavior<MarkerExtensionParams> & MarkerBehavior,
        tooltip?: Behavior<TooltipExtensionParams<TX, TY, TDatum>>,
        draw?: Behavior<DrawExtensionParams<TX, TY, TDatum>>,
        zoom?: Behavior<ZoomExtensionParams>,
        brush?: Behavior<BrushExtensionParams>,
    } = {};

    /** Create a new `Heatmap` and optionaly set `data`.
     * If you omit the `data` parameter, you add data later via `.setData(data)`. */
    static create<TX, TY, TDatum>(dataDescription: DataDescription<TX, TY, TDatum> = DataDescription.empty()): Heatmap<TX, TY, TDatum> {
        const heatmap = new this(dataDescription);

        heatmap.extensions.marker = heatmap.registerExtension(MarkerExtension) as MarkerBehavior;
        heatmap.extensions.tooltip = heatmap.registerExtension(TooltipExtension);
        heatmap.extensions.draw = heatmap.registerExtension(DrawExtension);
        heatmap.extensions.zoom = heatmap.registerExtension(ZoomExtension);
        heatmap.extensions.brush = heatmap.registerExtension(BrushExtension);

        return heatmap;
    }

    /** Replace current data by new data.
     * (If the new data are of different type, this method effectively changes the generic type parameters of `this`!
     * Returns re-typed `this`.) */
    setData<TX_, TY_, TDatum_>(dataDescription: DataDescription<TX_, TY_, TDatum_>): Heatmap<TX_, TY_, TDatum_> {
        this.state.setData(dataDescription);
        return this as unknown as Heatmap<TX_, TY_, TDatum_>;
    }

    /** Change X and Y domain without changing the data (can be used for reordering or hiding columns/rows). */
    setDomains(xDomain: TX[] | undefined, yDomain: TY[] | undefined): this {
        this.setData({
            ...this.state.originalData,
            xDomain: xDomain ?? this.state.originalData.xDomain,
            yDomain: yDomain ?? this.state.originalData.yDomain,
        });
        return this;
    }

    /** Change the filter function without changing the underlying data (can be used for showing/hiding individual data cells). */
    setFilter(filter: Provider<TX, TY, TDatum, boolean> | undefined): this {
        this.setData({
            ...this.state.originalData,
            filter: filter,
        });
        return this;
    }

    /** Set a color provider function (takes a datum and cell position and returns color).
     * The returned color can be a CSS color (e.g. 'green', '#f00000', 'rgba(255,0,0,0.5)',
     * or `Color` type (uint32 color encoding).
     *
     * Example:
     * ```
     * heatmap.setColor((datum, x, y, xIndex, yIndex) => datum >= 0.5 ? 'black' : '#ff0000');
     * ```
     * Use `ColorScale` to create efficient color providers for big numeric data:
     * ```
     * heatmap.setColor(ColorScale.continuous('YlOrRd', [0, 100]));
     * ```
     */
    setColor(colorProvider: Provider<TX, TY, TDatum, string | Color>): this {
        this.extensions.draw?.update({ colorProvider });
        return this;
    }

    /** Set a tooltip provider function (takes a datum and cell position and returns tooltip HTML content).
     *
     * Example:
     * ```
     * heatmap.setTooltip((datum, x, y, xIndex, yIndex) => `<b>${datum}<\b>`);
     * ```
     * Call `heatmap.setTooltip(null)` to disable tooltips; `heatmap.setTooltip('default')` to reset the default tooltip provider.
     */
    setTooltip(tooltipProvider: Provider<TX, TY, TDatum, string> | 'default' | null): this {
        this.extensions.tooltip?.update({
            tooltipProvider: (tooltipProvider === 'default') ? DefaultTooltipExtensionParams.tooltipProvider : tooltipProvider,
        });
        return this;
    }

    /** Change visual parameters that cannot be changed via CSS
     * (gaps between drawn rectangles, marker corner radius). */
    setVisualParams(params: Partial<VisualParams>): this {
        this.extensions.draw?.update({
            xGapPixels: params.xGapPixels,
            xGapRelative: params.xGapRelative,
            yGapPixels: params.yGapPixels,
            yGapRelative: params.yGapRelative,
            minRectSizeForGaps: params.minRectSizeForGaps,
        });
        this.extensions.marker?.update({
            markerCornerRadius: params.markerCornerRadius,
        });
        return this;
    }

    /** Set zooming parameters. Use `axis` parameter to turn zooming on/off.
     *
     * Example:
     * ```
     * heatmap.setZooming({ axis: "x" });    // Turn on zooming along the x-axis
     * heatmap.setZooming({ axis: "none" }); // Turn off zooming
     * ```
     */
    setZooming(params: Partial<ZoomExtensionParams>): this {
        this.extensions.zoom?.update(params);
        return this;
    }

    /** Controls how column/row indices and names are aligned to X and Y axes, when using `.zoom` and `.events.zoom` */
    setAlignment(x: XAlignmentMode | undefined, y: YAlignmentMode | undefined): this {
        this.state.setAlignment(x, y);
        return this;
    }

    /** Enforce change of zoom and return the zoom value after the change */
    zoom(request: Partial<ZoomEventValue<TX, TY>> | undefined): ZoomEventValue<TX, TY> | undefined {
        return this.state.zoom(request);
    }

    /** Return current zoom */
    getZoom(): ZoomEventValue<TX, TY> | undefined {
        return this.state.getZoom();
    }

    /** Set brushing parameters. Use `enabled` parameter to turn brushing on/off.
     *
     * Example:
     * ```
     * heatmap.setBrushing({ enabled: true }); // Turn on brushing
     * heatmap.events.brush.subscribe(e => console.log('Brushed', e)); // Listen to brush selection changes
     * ```
     */
    setBrushing(params: Partial<BrushExtensionParams>): this {
        this.extensions.brush?.update(params);
        return this;
    }
}


interface VisualParams {
    xGapPixels: DrawExtensionParams<unknown, unknown, unknown>['xGapPixels'],
    xGapRelative: DrawExtensionParams<unknown, unknown, unknown>['xGapRelative'],
    yGapPixels: DrawExtensionParams<unknown, unknown, unknown>['yGapPixels'],
    yGapRelative: DrawExtensionParams<unknown, unknown, unknown>['yGapRelative'],
    minRectSizeForGaps: DrawExtensionParams<unknown, unknown, unknown>['minRectSizeForGaps'],
    markerCornerRadius: MarkerExtensionParams['markerCornerRadius'],
}


// Possible TODOS for the future:
// TODO: Could: various zoom modes (horizontal, vertical, both, none...)
// TODO: Could: DataDescription.toArray2D - use Float32Array/Int32Array/... (+ mask array) when possible instead of Array (might speed up initialization up to 4x)
// TODO: Would: try setting `downsamplingPixelsPerRect` dynamically, based on rendering times
// TODO: Would: Smoothen zooming and panning with mouse wheel?
// TODO: Would: Tooltip/marker only showing on click?
// TODO: Would: add Behavior.onUnregister, use to keep a list of currently registered extensions?
