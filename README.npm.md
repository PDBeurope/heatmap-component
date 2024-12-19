<!-- README for NPM package -->

# HeatmapComponent

TypeScript library for creating interactive grid heatmaps.

The goal of HeatmapComponent is to provide a tool for visualizing two-dimensional data in the form of grid heatmaps. It focuses on interactivity, performance, and customizability.

### Features

-   Data type flexibility: appropriate for 2D arrays of numerical data, categorical data, and more complex data types
-   Customizable color scheme
-   Interactivity:
    -   Zooming (currently only in x-axis direction)
    -   Markers: highlighting current column, row, and data item
    -   Tooltips: showing custom content when the user hovers or clicks a data item
    -   Brushing: interactive selection of 2D regions
-   Efficient canvas-based rendering: smooth visualizations even with millions of data items
-   Integrability with other components via exposed events (hover, select, zoom...)
-   Extensibility: new behaviors can be added via extensions

### What it doesn't do

-   Visualization of data that don't fit into a 2D grid
-   Other shapes than rectangles
-   Axis labeling
-   Data loading or modification via UI

### Live demos

<https://pdbeurope.github.io/heatmap-component/> (deployed from `main` branch)

## Documentation

-   [Documentation for the latest release (v1.1.0)](https://github.com/PDBeurope/heatmap-component/blob/v1.1.0/docs/README.md)
