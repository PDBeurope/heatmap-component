import { Array2D } from './data/array2d';
import { Color } from './data/color';
import { DataDescription, Provider } from './data/data-description';
import { Behavior } from './extension';
import { DefaultNumericColorProviderFactory, DrawExtension, DrawExtensionParams, VisualParams } from './extensions/draw';
import { MarkerExtension, MarkerExtensionParams } from './extensions/marker';
import { DefaultTooltipExtensionParams, TooltipExtension, TooltipExtensionParams } from './extensions/tooltip';
import { ZoomExtension, ZoomExtensionParams } from './extensions/zoom';
import { HeatmapCore } from './heatmap-core';
import { XAlignmentMode, YAlignmentMode, ZoomEventParam } from './state';


// TODO: Must: fix markers on resize
// TODO: Should: adjust GitHub action to build always, publish pages on main branch, publish npm on tag
// TODO: Should: publish on npm before we move this to production, serve via jsdelivr
// TODO: Should: docs
// TODO: Could: reorganize demos and index.html, github.io
// TODO: Could: allow triggering markers from outside the code (and only vertical or only horizontal specifically, i.e. by handling out-of scope x/y appropriately)
// TODO: Could: various zoom modes (horizontal, vertical, both, none...)
// TODO: Would: try setting `downsamplingPixelsPerRect` dynamically, based on rendering times
// TODO: Would: Smoothen zooming and panning with mouse wheel?


export class Heatmap<TX, TY, TItem> extends HeatmapCore<TX, TY, TItem> {
    get events() { return this.state.events; }

    readonly extensions: {
        marker?: Behavior<MarkerExtensionParams>,
        tooltip?: Behavior<TooltipExtensionParams<TX, TY, TItem>>,
        draw?: Behavior<DrawExtensionParams<TX, TY, TItem>>,
        zoom?: Behavior<ZoomExtensionParams>,
    } = {};

    /** Create a new `Heatmap` and set `data` */
    static create<TX, TY, TItem>(data: DataDescription<TX, TY, TItem>): Heatmap<TX, TY, TItem> {
        const heatmap = new this(data);

        let colorProvider: Provider<TX, TY, TItem, Color> | undefined = undefined;
        if (heatmap.state.dataArray.isNumeric) {
            const dataRange = Array2D.getRange(heatmap.state.dataArray as Array2D<number>);
            colorProvider = DefaultNumericColorProviderFactory(dataRange.min, dataRange.max) as Provider<TX, TY, TItem, Color>;
        }
        heatmap.extensions.marker = heatmap.registerExtension(MarkerExtension);
        heatmap.extensions.tooltip = heatmap.registerExtension(TooltipExtension);
        heatmap.extensions.draw = heatmap.registerExtension(DrawExtension, { colorProvider });
        heatmap.extensions.zoom = heatmap.registerExtension(ZoomExtension);

        return heatmap;
    }

    /** Create a new `Heatmap` with dummy data */
    static createDummy(nColumns: number = 20, nRows: number = 20): Heatmap<number, number, number> {
        return this.create(DataDescription.createRandomWithGradient(nColumns, nRows));
    }

    /** Replace current data by new data.
     * (If the new data are of different type, this method effectively changes the generic type parameters of `this`!
     * Returns re-typed `this`.) */
    setData<TX_, TY_, TItem_>(data: DataDescription<TX_, TY_, TItem_>): Heatmap<TX_, TY_, TItem_> {
        this.state.setData(data);
        return this as unknown as Heatmap<TX_, TY_, TItem_>;
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

    /** Change filter function without changing the underlying data (can be used for showing/hiding individual data items). */
    setFilter(filter: Provider<TX, TY, TItem, boolean> | undefined): this {
        this.setData({
            ...this.state.originalData,
            filter: filter,
        });
        return this;
    }

    /** Set a color provider function (takes data item and position and returns color).
     * Example:
     * ```
     * hm.setColor((d, x, y, xIndex, yIndex) => d >= 0.5 ? 'black' : '#ff0000');
     * ```
     * Use `Color.createScale` to create efficient color providers for big numeric data:
     * ```
     * hm.setColor(Color.createScale('YlOrRd', [0, 100]));
     * ```
     */
    setColor(colorProvider: Provider<TX, TY, TItem, string | Color>): this {
        this.extensions.draw?.update({ colorProvider });
        return this;
    }

    setTooltip(tooltipProvider: Provider<TX, TY, TItem, string> | 'default' | null): this {
        this.extensions.tooltip?.update({
            tooltipProvider: (tooltipProvider === 'default') ? DefaultTooltipExtensionParams.tooltipProvider : tooltipProvider,
        });
        return this;
    }

    setVisualParams(params: Partial<VisualParams>): this {
        this.extensions.draw?.update(params);
        return this;
    }

    /** Controls how column/row indices and names map to X and Y axes. */
    setAlignment(x: XAlignmentMode | undefined, y: YAlignmentMode | undefined): this {
        this.state.setAlignment(x, y);
        return this;
    }

    /** Set zooming parameters. Use `axis` parameter to turn zooming on/off. */
    setZooming(params: Partial<ZoomExtensionParams>): this {
        this.extensions.zoom?.update(params);
        return this;
    }

    /** Enforce change of zoom and return the zoom value after the change */
    zoom(z: Partial<ZoomEventParam<TX, TY, TItem>> | undefined): ZoomEventParam<TX, TY, TItem> {
        return this.state.zoom(z);
    }

    /** Return current zoom */
    getZoom(): ZoomEventParam<TX, TY, TItem> {
        return this.state.getZoom();
    }
}
