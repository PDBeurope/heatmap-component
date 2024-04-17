import { range } from 'lodash';
import { Array2D } from './data/array2d';
import { Color } from './data/color';
import { ExtensionInstance } from './extension';
import { DefaultNumericColorProviderFactory, DrawExtension, DrawExtensionParams, VisualParams } from './extensions/draw';
import { MarkerExtension, MarkerExtensionParams } from './extensions/marker';
import { DefaultTooltipExtensionParams, TooltipExtension, TooltipExtensionParams } from './extensions/tooltip';
import { ZoomExtension, ZoomExtensionParams } from './extensions/zoom';
import { HeatmapCore } from './heatmap-core';
import { DataDescription, Provider, XAlignmentMode, YAlignmentMode, ZoomEventParam } from './state';


// TODO: Should: publish on npm before we move this to production, serve via jsdelivr
// TODO: Should: think in more depth what could happen when changing data type with filters, providers, etc. already set
// TODO: Should: reasonable level of customizability
// TODO: Should: docs
// TODO: Could: various zoom modes (horizontal, vertical, both, none...)
// TODO: Would: try setting `downsamplingPixelsPerRect` dynamically, based on rendering times
// TODO: Would: Smoothen zooming and panning with mouse wheel?


export class Heatmap<TX, TY, TItem> extends HeatmapCore<TX, TY, TItem> {
    get events() { return this.state.events; }

    readonly extensions: {
        marker?: ExtensionInstance<MarkerExtensionParams>,
        tooltip?: ExtensionInstance<TooltipExtensionParams<TX, TY, TItem>>,
        draw?: ExtensionInstance<DrawExtensionParams<TX, TY, TItem>>,
        zoom?: ExtensionInstance<ZoomExtensionParams>,
    } = {};

    /** Create a new `Heatmap` and set `data` */
    static create<TX, TY, TItem>(data: DataDescription<TX, TY, TItem>): Heatmap<TX, TY, TItem> {
        const instance = new this(data);

        let colorProvider: Provider<TX, TY, TItem, Color> | undefined = undefined;
        if (instance.state.dataArray.isNumeric) {
            const dataRange = Array2D.getRange(instance.state.dataArray as Array2D<number>);
            colorProvider = DefaultNumericColorProviderFactory(dataRange.min, dataRange.max) as Provider<TX, TY, TItem, Color>;
        }
        instance.extensions.marker = instance.registerBehavior(MarkerExtension);
        instance.extensions.tooltip = instance.registerBehavior(TooltipExtension);
        instance.extensions.draw = instance.registerBehavior(DrawExtension, { colorProvider });
        instance.extensions.zoom = instance.registerBehavior(ZoomExtension);

        return instance;
    }

    /** Create a new `Heatmap` with dummy data */
    static createDummy(nColumns: number = 20, nRows: number = 20): Heatmap<number, number, number> {
        return this.create(makeRandomData2(nColumns, nRows));
    }

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

    /** Enforce change of zoom and return the zoom value after the change */
    zoom(z: Partial<ZoomEventParam<TX, TY, TItem>> | undefined, origin?: string): ZoomEventParam<TX, TY, TItem> {
        return this.state.zoom(z, origin);
    }

    /** Return current zoom */
    getZoom(): ZoomEventParam<TX, TY, TItem> {
        return this.state.getZoom();
    }
}


function makeRandomData(nColumns: number, nRows: number): DataDescription<number, number, number> {
    const raw = Array2D.createRandom(nColumns, nRows);
    return {
        items: raw.items as number[],
        x: (d, i) => i % nColumns,
        y: (d, i) => Math.floor(i / nColumns),
        xDomain: range(nColumns),
        yDomain: range(nRows),
    };
}

function makeRandomData2(nColumns: number, nRows: number): DataDescription<number, number, number> {
    const data = makeRandomData(nColumns, nRows);
    return {
        ...data,
        items: data.items.map((d, i) => (d * 0.5) + (i % nColumns / nColumns * 0.5)),
    };
}
