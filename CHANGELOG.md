# Change Log

All notable changes to this project will be documented in this file, following the suggestions of [Keep a CHANGELOG](http://keepachangelog.com/). This project adheres to [Semantic Versioning](http://semver.org/) for its most widely used - and defacto - public interfaces.

## [Unreleased]

- Fixed tooltip placement bug (not moving when scrolling page)

## [0.5.0] - 2024-03-01

- Pinnable tooltips
- Highlight column and row on hover
- Zooming does not require Ctrl

## [0.4.0] - 2024-02-23

- Zoom event gives more info
- `zoom` method to set zoom, `getZoom` to retrieve current zoom
- Zoom event, `zoom()`, and `getZoom()` are customizable by `setAlignment`
- Handling window resize
- Fixed bug with wrong data being shown when zoomed out

## [0.3.0] - 2024-02-21

- Customizing tooltips via `setTooltip`
- Filtering via `setFilter`
- Click and hover events
- Zoom event
- Customizing gaps between rectangles by `setVisualParams`

## [0.2.0] - 2024-02-16

- Support for setting data via contructor or `setData`
- Support for setting coloring via `setColor`

## [0.1.0] - 2024-02-16

- Initial PoC
