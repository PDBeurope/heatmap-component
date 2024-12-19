# HeatmapComponent – Events

HeatmapComponent provides several events that the users can subscribe to. All of these are RxJS `BehaviorSubject`, so they emit the current value to new subscribers.

-   `hover`: Fires when the user hovers over the component. Subject value holds information about the hovered cell.

-   `select`: Fires when the user selects/deselects a cell (e.g. by clicking on it). Subject value holds information about the selected cell.

-   `brush`: Fires when the user selects/deselects a region by brushing (i.e. press mouse button, drag, release). Subject value holds information about the stage of brushing gesture (start/brush/end) and the selected region. Only fires when `BrushExtension` is enabled.
        
-   `zoom`: Fires when the component is zoomed in or out, or panned (translated). Subject value is the same as what [`getZoom`](./customization.md#getZoom) returns.

-   `resize`: Fires when the window is resized. Subject value is the size of the canvas in pixels.

-   `data`: Fires when the visualized data change (including filter or domain change).

-   `render`: Fires when the component is initially rendered in a div.

```ts
// Example usage:
heatmap.events.select.subscribe(e => {
    console.log('selecting:', e);
});

// Example usage from extension code (automatically unsubscribes on unregister)
this.subscribe(this.state.events.select, e => {
    console.log('selecting:', e);
});
```
