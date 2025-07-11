# HeatmapComponent – Customization

## Data

### `create`

The easiest way to set the heatmap data is to pass them as in `data` parameter when creating a heatmap instance via the static `create` method. This parameter is optional.

When using with TypeScript, `Heatmap` class has three generic type parameters: `TX` is the type of X domain values ("column names"), `TY` is the type of Y domain values ("row names"), `TDatum` is the type of data items stored in the individual grid cells.

```ts
static create<TX, TY, TDatum>(dataDescription: DataDescription<TX, TY, TDatum> = DataDescription.empty()): Heatmap<TX, TY, TDatum>

// Example usage:
const data = {
    xDomain: [1, 2, 3, 4], // "names of columns"
    yDomain: ['A', 'B', 'C'], // "names of rows"
    data: [
        { col: 1, row: 'A', score: 0.0 },
        { col: 1, row: 'B', score: 0.2 },
        ...
    ],
    x: d => d.col,
    y: d => d.row,
};
const heatmap = Heatmap.create(data);
const heatmap2 = Heatmap.create<number, string, { col: number, row: string, score: number }>(data);
const heatmap3 = Heatmap.create<number, string, { col: number, row: string, score: number }>(); // set data later
```

### `setData`

This method can be used to change heatmap data after creation. Returns the same heatmap instance (`this`).

(If the new data are of different type, this method effectively changes the generic type parameters of `this` and returns re-typed `this`.)

```ts
setData<TX_, TY_, TDatum_>(dataDescription: DataDescription<TX_, TY_, TDatum_>): Heatmap<TX_, TY_, TDatum_>

// Example usage:
heatmap3.setData(data);
```

### `setDomains`

Changes X and/or Y domains without changing the data. Can be used for reordering or hiding columns/rows.

```ts
setDomains(xDomain: TX[] | undefined, yDomain: TY[] | undefined): this

// Example usage:
heatmap.setDomains([1, 2, 4], undefined);          // hide column 3
heatmap.setDomains(undefined, ['C', 'B', 'A']);    // reverse row order
heatmap.setDomains([1, 2, 3, 4], ['A', 'B', 'C']); // reset original domains
```

### `setFilter`

This method can be used for showing/hiding individual data cells without changing the underlying heatmap data. This is achieved by providing a **filter function**. This function will be executed for each non-empty cell and only cells where is returns `true` will be shown.

```ts
setFilter(filter: ((datum: TDatum, x: TX, y: TY, xIndex: number, yIndex: number) => boolean) | undefined): this

// Example usage:
heatmap.setFilter(d => d.score > 0.5);                        // Only show cells with score above 0.5
heatmap.setFilter((d, x, y) => y === 'B');                    // Only show cells in row 'B'
heatmap.setFilter((d, x, y, xIndex, yIndex) => yIndex === 0); // Only show cells in the first row (here row 'A')
heatmap.setFilter(undefined);                                 // Disable any active filter
```

---

## Appearance

### `setColor`

Change coloring function. Default coloring is "everything gray" so you will very likely want to change this.

Color.fromRgba()
`colorProvider` function will be executed for each non-empty cell to get its color. It has to return a color either as a CSS string (e.g. `'green'`, `'#f00000'`, `'rgba(255,0,0,0.5)'`) or as a package-specific [`Color`](./color-scales.md#color-encoding) type (encoding each color as a number for better performance, e.g. `Color.fromString('green')`, `Color.fromRgb(255,0,0)`, `Color.fromRgba(255,0,0,0.5)`). The coloring function can also take multiple parameters, being datum, column name, row name, column index, row index.

[`ColorScale`](./color-scales.md) provides useful functions for creating continuous and discrete (categorical) color scales.

```ts
setColor(colorProvider: (datum: TDatum, x: TX, y: TY, xIndex: number, yIndex: number) => string | Color): this

// Example usage:
heatmap.setColor(d => d.score > 0 ? Color.fromRgb(0, 150, 0) : Color.fromRgb(255, 0, 0));
heatmap.setColor((d, x, y, xIndex, yIndex) => (xIndex + yIndex) % 2 ? 'black' : 'white');

const colorScale = ColorScale.continuous('YlOrRd', [0, 1]); // yellow-orange-red color scale for values from 0 to 1
heatmap.setColor(d => colorScale(d.score));
```

### `setVisualParams`

This methods is used to adjust visual parameters that cannot be adjusted via CSS (this is mainly related to the gaps between drawn rectangles). Parameters that are not provided (or undefined) when calling the method will retain their current value.

`xGapPixels` and `xGapRelative` control the gap between neighboring columns. `xGapPixels` is absolute width in pixels; `xGapRelative` is relative to column width (including the gap). If both are non-null, the smaller final gap value will be used.

`yGapPixels` and `yGapRelative` control the gap between neighboring rows in the same way.

When the heatmap is zoomed out and the column width (or row height) becomes too small, showing gaps is switched off to avoid Moire patterns. `minRectSizeForGaps` parameter controls the threshold for column width and row height (in pixels), when showing gaps is switched on. Set to 0 to always show gaps (not recommended).

```ts
setVisualParams(params: Partial<VisualParams>): this

// Example usage:
heatmap.setVisualParams({ xGapPixels: 0, yGapPixels: 0 }); // no gaps
heatmap.setVisualParams({ xGapPixels: null, xGapRelative: 0.1 }); // gap between columns always 10% of column width
heatmap.setVisualParams({ yGapPixels: 5, yGapRelative: null }); // gap between rows always 5px
heatmap.setVisualParams({ minRectSizeForGaps: 5 }); // disable gaps when column width or row height is below 5px
heatmap.setVisualParams({ markerCornerRadius: 5 }); // round corners for markers
heatmap.setVisualParams({ xGapPixels: 2, xGapRelative: 0.1, yGapPixels: 2, yGapRelative: 0.1, minRectSizeForGaps: 2, markerCornerRadius: 1 }); // reset defaults
```

### `setTooltip`

When hovering over or clicking a cell, a tooltip is shown. `setTooltip` method is used to customize the content of this tooltip or to disable it complete.

Mind that if providing `tooltipProvider` function, it must return an HTML string, so you will have to escape some characters.

```ts
setTooltip(tooltipProvider: Provider<TX, TY, TDatum, string> | 'default' | null): this

// Example usage:
heatmap.setTooltip((d, x, y, xIndex, yIndex) => `<div style="font-weight: bold; margin-bottom: 0.5em;">Score: ${d.score}</div>Column ${x}, Row ${y}<br>Indices [${xIndex},${yIndex}]`);
heatmap.setTooltip(null); // disable tooltips
heatmap.setTooltip('default'); // reset default tooltip content
```

### Styling via CSS

All elements of the heatmap component are styled via [this CSS](../src/heatmap-component.css). You can override the styles for classes defined there to customize the appearance of the component.

This includes e.g. background color, cursor shape, marker, and tooltip style. However, the elements that are visualized in canvas (i.e. the colored rectangles) cannot be styled in this way.

---

## Zooming

By default, the heatmap is zoomed out (showing all columns and rows), and manual zooming is disabled.

### `setZooming`

This method is used to enable and customize manual zooming.

Currently, only horizontal zooming mode is implemented (`axis: 'x'`), providing this functionality:

-   mouse scroll —> zoom in/out
-   horizontal scroll (on trackpad) —> pan (move to the sides)
-   shift + mouse scroll —> pan
-   mouse click and drag —> pan
-   double click —> zoom in

```ts
setZooming(params: Partial<ZoomExtensionParams>): this

// Example usage:
heatmap.setZooming({ axis: 'x' }); // enable zooming along X axis
heatmap.setZooming({ axis: 'x', scrollRequireCtrl: true }); // only zoom when Ctrl or Cmd key is pressed
heatmap.setZooming({ axis: 'none' }); // disable zooming
```

### `getZoom`

This method returns the current zoom state of the heatmap.

```ts
getZoom(): ZoomEventValue<TX, TY> | undefined

// Example usage:
console.log(heatmap.getZoom());
// For fully-zoomed-out heatmap this would return:
// {
//     xMinIndex: 0, xMaxIndex: 4, yMinIndex: 0, yMaxIndex: 3,
//     xFirstVisibleIndex: 0, xLastVisibleIndex: 3, yFirstVisibleIndex: 0, yLastVisibleIndex: 2,
//     xMin: 1, xMax: 5,
//     xFirstVisible: 1, xLastVisible: 4,  yFirstVisible: "A", yLastVisible: "C"
// }
```

The `ZoomEventValue` object returned by this method contains the information about the edges of the viewport in relation to the visualized data. It provides two sets of properties: index-based properties (having `Index` suffix) use column and row indices counted from 0 (in our example, it's columns 0, 1, 2, 3, and rows 0, 1, 2); value-based properties (without `Index` suffix) use the values ("names") assigned to the columns and rows (in our example, it's columns 1, 2, 3, 4 and rows 'A', 'B', 'C').

`xMinIndex, xMaxIndex, yMinIndex, yMaxIndex` are continuous column/row indices corresponding to the left/right/top/bottom edge of the viewport. These values depend on current alignment settings (see [`setAlignment`](#setAlignment)).

`xFirstVisibleIndex, xLastVisibleIndex, yFirstVisibleIndex, yLastVisibleIndex` are indices of the first/last column/row that is at least partially visible.

`xMin, xMax, yMin, yMax` are continuous X/Y values corresponding to the left/right/top/bottom edge of the viewport. These values are only available if the column/row names are numbers in either increasing or decreasing order. These values depend on current alignment settings (see [`setAlignment`](#setAlignment)).

`xFirstVisible, xLastVisible, yFirstVisible, yLastVisible` are the names of the first/last column/row that is at least partially visible.

### `zoom`

This method is used to change the zoom state of the heatmap. It is always enabled, regardless of the manual zooming settings. Returns the zoom state after the requested change (this is not necessarily the same as the requested zoom state, because of the restrictions on zoom scale and translation), or undefined if the heatmap is not rendered yet.

The properties of the `request` parameter have the same meaning as those returned by `getZoom` but at most one property should be provided to specify each edge (left/right/top/bottom) of the zoomed area (e.g. do not provide `xMin` and `xFirstVisible` at the same time as they would conflict). If no property is provided for any of the edges, this edge will be set to the outermost available position (i.e. zoom "from the beginning" / "to the end") – this can be used to fully zoom out horizontally, vertically, or both. Interpretation of some properties depends on current alignment settings, in the same way as with `getZoom` (see [`setAlignment`](#setAlignment)). Note that `xMin, xMax, yMin, yMax` can only be used if the column/row names are numbers in either increasing or decreasing order.

```ts
zoom(request: Partial<ZoomEventValue<TX, TY>> | undefined): ZoomEventValue<TX, TY> | undefined

// Example usage:
heatmap.zoom({ xFirstVisibleIndex: 1, xLastVisibleIndex: 2, yFirstVisibleIndex: 0, yLastVisibleIndex: 2 }); // Set zoom based on column/row indices (fully visible 2 columns and 3 rows)
heatmap.zoom({ xFirstVisible: 2, xLastVisible: 3, yFirstVisible: 'A', yLastVisible: 'C' }); // Set zoom based on column/row names (fully visible 2 columns and 3 rows)

heatmap.zoom({ xMinIndex: 1.2, xMaxIndex: 2.8, yMinIndex: 0.6, yMaxIndex: 2.7 }); // Set zoom based on column/row indices (partially visible columns/rows)
heatmap.zoom({ xMin: 1.9, xMax: 4.1 }); // Set horizontal zoom based on column names (partially visible columns); vertically zoom out to show all rows

heatmap.zoom(undefined); // Reset zoom (zoom out)
```

### `setAlignment`

This method controls how column/row indices and names are aligned to X and Y axes, when using `getZoom` method, `zoom` method, and `zoom` event.

Let's demonstrate this on our example with 4 columns, corresponding to X values ("column names") 1, 2, 3, 4. Column indices are always 0-based, so 0, 1, 2, 3.

Default alignment is `'left'`, so the reported value is aligned with the left edge of the column:

```
xIndex:    0   0.5   1   1.5   2   2.5   3   3.5   4
           ┌─────────┬─────────┬─────────┬─────────┐
           │ Index 0 │ Index 1 │ Index 2 │ Index 3 │
           │ Value 1 │ Value 2 │ Value 3 │ Value 4 │
           └─────────┴─────────┴─────────┴─────────┘
x:         1   1.5   2   2.5   3   3.5   4   4.5   5
```

When using `'center'`, the reported value is aligned with the center of the column:

```
xIndex:  -0.5   0   0.5   1   1.5   2   2.5   3   3.5
           ┌─────────┬─────────┬─────────┬─────────┐
           │ Index 0 │ Index 1 │ Index 2 │ Index 3 │
           │ Value 1 │ Value 2 │ Value 3 │ Value 4 │
           └─────────┴─────────┴─────────┴─────────┘
x:        1.5   1   1.5   2   2.5   3   3.5   4   4.5
```

When using `'right'`, the reported value is aligned with the right edge of the column:

```
xIndex:   -1  -0.5   0   0.5   1   1.5   2   2.5   3
           ┌─────────┬─────────┬─────────┬─────────┐
           │ Index 0 │ Index 1 │ Index 2 │ Index 3 │
           │ Value 1 │ Value 2 │ Value 3 │ Value 4 │
           └─────────┴─────────┴─────────┴─────────┘
x:         0   1.5   1   1.5   2   2.5   3   3.5   4
```

Vertical alignment (rows) works in the same way, but `'top'` and `'bottom'` is used instead of `'left'` and `'right'`.

Default alignment is `'left'` and `'top'`, which is also what HeatmapComponent uses internally.

```ts
setAlignment(x: 'left' | 'center' | 'right' | undefined, y: 'top' | 'center' | 'bottom' | undefined): this

// Example usage:
heatmap.setAlignment('center', 'center');
heatmap.setAlignment('left', 'top');
```

---

## Brushing

Brushing is the interactive specification of a two-dimensional region using a pointing gesture, such as by clicking and dragging the mouse. This interactive behavior is implemented via `BrushExtension` and can be turned on by the `setBrushing` method. Brushing events can be listened to via `events.brush`.

### `setBrushing`

This method is used to enable and customize brushing behavior.

```ts
setBrushing(params: Partial<BrushExtensionParams>): this

// Example usage:
heatmap.setBrushing({ enabled: true, snap: true, closeButton: true }); // Turn on brushing
// Selected region will be snapped to the nearest column and row boundary when mouse button is released
// "Close" button will be shown in the corner of the selected region

heatmap.events.brush.subscribe(e => {
    // Listen to brush selection changes
    if (e.type === 'end') {
        console.log('Selection completed:', e);
    } else {
        console.log('Selection in progress:', e);
    }
});
```

---

## Extension customization

Each of the [builtin extensions](./architecture.md#extensions) (Draw, Marker, Tooltip, Zoom, Brush) has a set of parameters, initially set to their default values. The parameter values can be changed via `update` method.

```ts
// Example usage:
heatmap.extensions.tooltip?.update({ pinnable: false }); // Disable tooltip pinning
heatmap.extensions.marker?.update({ freeze: true }); // Disable markers
heatmap.extensions.marker?.update({ freeze: false, markerCornerRadius: 5 }); // Enable markers, with round corners
```

Note: Some of the extension parameters are also exposed via other methods, e.g. `setVisualParams`, `setZooming`, `setBrushing`.

### Custom extensions

Users of HeatmapComponent can implement their own extensions, following the example of existing extensions (see [/src/heatmap-component/extensions](../src/heatmap-component/extensions/)).
These extensions can then be registered by:

```ts
heatmap.registerExtension(CustomExtension, { ...parameterValues }); // extension parameter values are optional
```
