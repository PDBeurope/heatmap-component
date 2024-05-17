# Heatmap Component documentation

TODO: ways of using HeatmapComponent: build vs lib

TODO: index of topics (Quickstart, customization, colors/scales, architecture/extensions)

## Quickstart guide

This Quickstart guide will walk you through setting up a basic heatmap visualization using the HeatmapComponent library.

### Step 1: Setup

First, make sure you include the HeatmapComponent script and styles in your HTML file.

```html
<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8" />
        <title>HeatmapComponent minimal example</title>

        <!-- HeatmapComponent script and style: -->
        <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/heatmap-component@latest/build/heatmap-component.css" />
        <script src="https://cdn.jsdelivr.net/npm/heatmap-component@latest/build/heatmap-component.js"></script>
    </head>
</html>
```

In this example we use pre-bundled JS and CSS files via jsDelivr CDN. You can replace `@latest` in the URLs by a specific version, e.g. `@1.0.0`, or use your own bundles (if using HeatmapComponent as a library).

Including the `heatmap-component.js` script creates a global object `HeatmapComponent` that we will use later.

### Step 2: Add a DIV element to hold the heatmap

Add a DIV element somewhere in the page and give it a custom `id` attribute. This DIV is where the heatmap will be rendered.

```html
<body>
    <div id="app" style="width: 500px; height: 300px; border: solid gainsboro 1px;"></div>
    <script>
        // Your code will go here
    </script>
</body>
</html>
```

### Step 3: Define data

Within the script section of the HTML file, we will define the data to be visualized.

First, we need to define the grid by providing the "names" for columns (X domain) and rows (Y domain). These values can be of any simple type (string, number, boolean, null); objects and undefined are not allowed.

Next, we define the data values that will be placed in the grid. We follow the D3.js convention and call each of these values a "datum" (plural: "data" or "data items"). Each datum can be of any type, including more complex types such as objects or arrays. However, `undefined` is not allowed as a datum. In this example, we provide 9 data, each being an object with col, row, and score.

Finally, we define how data are placed in the grid. We do this by providing `x` function, which takes a datum and returns a column name, and `y` function, which returns row name. These functions can also take a second parameter, which is the index of the datum (e.g. `x: (d, i) => i%nColumns, y: (d, i) => Math.floor(i/nColumns)` will place the data row-by-row). Alternatively, you can provide an array of row/column names instead of a function (first name belongs to the first datum etc.).

```js
const data = {
    xDomain: [1, 2, 3, 4], // "names of columns"
    yDomain: ['A', 'B', 'C'], // "names of rows"
    data: [
        { col: 1, row: 'A', score: 0.0 },
        { col: 1, row: 'B', score: 0.2 },
        { col: 1, row: 'C', score: 0.4 },
        { col: 2, row: 'A', score: 0.6 },
        { col: 2, row: 'B', score: 0.8 },
        { col: 2, row: 'C', score: 1.0 },
        { col: 3, row: 'A', score: 0.3 },
        { col: 3, row: 'C', score: 0.7 },
        { col: 4, row: 'B', score: 0.5 },
    ],
    x: d => d.col, // function that takes a datum and returns column name
    y: d => d.row, // function that takes a datum and returns row name
};
```

### Step 4: Create a heatmap instance

Create a heatmap instance using the prepared data.

```js
const heatmap = HeatmapComponent.Heatmap.create(data);
```

You can also call `create()` with no argument and add data later via `heatmap.setData(data)`.

### Step 5: Customize

Customize the heatmap instance as needed. Typically, you'll want to specify coloring (default coloring assigns gray color to any datum). This is done by calling `setColor` method and providing a coloring function, which takes a datum and returns a color (can be a CSS color, e.g. `'green'`, `'#f00000'`, `'rgba(255,0,0,0.5)'`, or a package-specific `Color` type (encoding each color as a 32-bit unsigned integer for better performance TODO: link to details)). The coloring function can also take multiple parameters, being datum, column name, row name, column index, row index.

Use `HeatmapComponent.createColorScale` to create continuous color scales (details [here](./color-scales.md)).

```js
const colorScale = HeatmapComponent.createColorScale('YlOrRd', [0, 1]); // yellow-orange-red color scale for values from 0 to 1
heatmap.setColor(d => colorScale(d.score)); // function that takes a datum and returns color
```
// TODO update this

### Step 6: Render heatmap

Finally, render the heatmap in the specified HTML element.

```js
heatmap.render('app');
```

### Step 7: Subscribe to events (optional)

You can subscribe to events emitted by the heatmap instance to integrate it with other parts of the page. All these events are RxJS BehaviorSubjects.

```js
heatmap.events.select.subscribe(e => console.log('Selected', e)); // fires when the user clicks a data cell
```

And that's it! You now have a basic heatmap visualization displayed in your web page.

Full HTML for this example [here](../demo/minimal-example.html)

Live demo: <https://pdbeurope.github.io/heatmap-component/demo/minimal-example.html>

TODO: plunkr live example?
