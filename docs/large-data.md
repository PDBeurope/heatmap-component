# HeatmapComponent – Working with large data

HeatmapComponent aims to provide performant visualization even for large datasets. However, there are a few things to keep in mind when working with large datasets.

-   Use only simple data types as datum type (`number`, `string`, `boolean`). Using `object` as datum type can significantly slow down the visualization.

    ```ts
    // Potentially slow:
    const heatmap = Heatmap.create({
        xDomain: [0, 1, 2, ..., nColumns-1],
        yDomain: [0, 1, 2, ..., nRows-1],
        data: [{ row: 0, col: 0, value: 0.1 }, { row: 0, col: 1, value: 0.2 }, { row: 0, col: 2, value: 0.3 }, ...],
        x: d => d.col,
        y: d => d.row,
    });

    // Better:
    const heatmap = Heatmap.create({
        xDomain: [0, 1, 2, ..., nColumns-1],
        yDomain: [0, 1, 2, ..., nRows-1],
        data: [0.1, 0.2, 0.3, ...], // Yet better: use Float32Array
        x: (d, i) => i % nColumns,
        y: (d, i) => Math.floor(i / nColumns),
    });
    ```

    Note: Providing the data in a `Float32Array`, `Int16Array` etc. instead of a standard `Array` may be faster. However, the current implementation of HeatmapComponent still uses standard `Array` internally.

-   Use a coloring function that returns type `Color` (not string), and avoid complex operations and conversions to and from string within the body of the coloring function. You can use [`ColorScale`](./color-scales.md) to create a coloring function, or call `Color.fromRgb` to create color within the body of the coloring function. `ColorScale` is optimized for use with HeatmapComponent and is usually faster then color scales from D3.

    ```ts
    // Potentially slow:
    hm.setColor(d3.scaleSequential(d3.interpolateSpectral).domain([0, 1]));

    // Better:
    hm.setColor(ColorScale.continuous('Spectral', [0, 1]));
    hm.setColor(ColorScale.continuous([0, 1], ['white', '#ff00ff']));

    // Potentially slow:
    hm.setColor(d => (d < 0.5 ? '#000000' : 'yellow'));

    // Better:
    hm.setColor(d => (d < 0.5 ? Color.fromRgb(0, 0, 0) : Color.fromRgb(255, 255, 0)));

    // Even better:
    const black = Color.fromString('#000000');
    const yellow = Color.fromString('yellow');
    hm.setColor(d => (d < 0.5 ? black : yellow));
    ```
