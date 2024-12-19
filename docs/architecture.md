# HeatmapComponent – Library architecture

HeatmapComponent uses a modular architecture designed to provide flexible functionality for creating and customizing heatmap visualizations. At the core of the package is the HeatmapCore class, to which more functionality is added through extensions.

- [**HeatmapCore**](../src/heatmap-component/heatmap-core.ts) class serves as the backbone of the package and provides core functionality for a heatmap instance: it keeps state in a State object and implements rendering of the component as a DOM element in HTML. It also provides a mechanism for extending its functionality through extensions. HeatmapCore alone (without any extensions) is not sufficient create a usable visualization.

- [**State**](../src/heatmap-component/state.ts) class encapsulates the state of a heatmap instance. Synchronization of the heatmap instance and registered extensions is done by sharing the same State object. State also provides events that the extensions (and client code) can subscribe to.

- [**Extensions**](../src/heatmap-component/extension.ts) are used to add behavior to a heatmap instance. Each extension describes how to create, register, update, and unregister a Behavior object. Flexibility is achieved through parameters, which can be set during the Behavior creation and updated later. Essential builtin extensions (Draw, Marker, Tooltip, Zoom, Brush) are implemented in [/src/heatmap-component/extensions](../src/heatmap-component/extensions/); users can implement custom extensions in a similar manner.

- [**Heatmap**](../src/heatmap-component/heatmap.ts) class represents the main entry point for users of the heatmap-component package. It extends HeatmapCore by registering essential builtin extensions (Draw, Marker, Tooltip, Zoom, Brush) and implementing useful public methods for interacting with heatmap instances.

- [**heatmap-component.css**](../src/heatmap-component.css) defines styling for all parts of the heatmap component. Appearance of the heatmap can be customized by overriding the styles defined here. 

- [**main.ts**](../src/main.ts) is the main file for importing `HeatmapComponent` as a dependency, [**index.ts**](../src/index.ts) is the entrypoint for the bundle.

- **Demos** provide examples for HeatmapComponent usage and serve for testing ([TS](../src/heatmap-component/demo.ts), [HTML](../demo/))
