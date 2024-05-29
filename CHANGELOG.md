# Change Log

All notable changes to this project will be documented in this file, following the suggestions of [Keep a CHANGELOG](http://keepachangelog.com/). This project adheres to [Semantic Versioning](http://semver.org/) for its most widely used - and defacto - public interfaces.

## [Unreleased]

-   Breaking change: Renamed item/items to datum/data in several places
-   Breaking change: Default coloring is "everything gray", even for numeric values
-   Breaking change: Color scales are created by `ColorScale.continuous`
-   Breaking change: Default axis alignment for (`zoom`, `getZoom`, `events.zoom`) changed from center,center to left,top (call `setAlignment` to change)
-   Breaking change: Changed value type for `hover` and `select` events -> `{ cell?: { datum?: TDatum, ... }, sourceEvent?: MouseEvent }`
-   Breaking change: Dropped `formatDataItem` function
-   `Heatmap.create` callable without `data` parameter
-   Can manipulate markers via `hm.extensions.marker?.drawMarkers({...})`

## [0.9.0] - 2024-04-29

-   Renamed the package from `hotmap` to `heatmap-component`
-   Zooming is off by default (call `hm.setZooming({ axis: 'x' })` to turn it on)

## [0.8.0] - 2024-04-26

-   More efficient drawing to canvas (`putImageData` instead of `fillRect`)
-   Breaking change: renamed `click` event to `select`

## [0.7.0] - 2024-03-15

-   Changing domains while keeping data (`setDomains`)
-   Adjust zoom behavior when xDomain or yDomain changes size
-   Styling via CSS

## [0.6.0] - 2024-03-13

-   Fixed tooltip placement bug (not moving when scrolling page)
-   Pinned tooltip moves on zoom/pan/resize
-   Some work on efficient downscaling and anti-aliasing (not ready)

## [0.5.0] - 2024-03-01

-   Pinnable tooltips
-   Highlight column and row on hover
-   Zooming does not require Ctrl

## [0.4.0] - 2024-02-23

-   Zoom event gives more info
-   `zoom` method to set zoom, `getZoom` to retrieve current zoom
-   Zoom event, `zoom()`, and `getZoom()` are customizable by `setAlignment`
-   Handling window resize
-   Fixed bug with wrong data being shown when zoomed out

## [0.3.0] - 2024-02-21

-   Customizing tooltips via `setTooltip`
-   Filtering via `setFilter`
-   Click and hover events
-   Zoom event
-   Customizing gaps between rectangles by `setVisualParams`

## [0.2.0] - 2024-02-16

-   Support for setting data via contructor or `setData`
-   Support for setting coloring via `setColor`

## [0.1.0] - 2024-02-16

-   Initial PoC
