<!-- README for GitHub -->

# Heatmap Component

TypeScript library for creating interactive grid heatmaps

TODO: more intro, why we do this
TODO: high level overview of functionality
TODO: image

## Documentation

-   [Documentation pages](./docs/README.md)

## Demos

-   [Live demos on github.io](https://pdbeurope.github.io/heatmap-component/)

## npm package

This package is published to npm: https://www.npmjs.com/package/heatmap-component

## Development

### Get source code

```sh
git clone https://github.com/PDBeurope/heatmap-component.git
cd heatmap-component/
```

### Install dependencies and build

```sh
npm install
npm run rebuild
```

### Run locally

```sh
npm run start
```

Then go to http://localhost:7000/

### Release

To release a new version of this package:

-   Change version in `package.json`
-   Change version in the documentation link in `README.npm.md`
-   Update `CHANGELOG.md`
-   Run `npm install` (to update `package-lock.json`)
-   Ensure `npm lint && npm rebuild && npm test` works properly
-   Commit and push to `main` branch (use the version with prepended "v" as the commit message, e.g. `v1.0.0`)
-   Create a git tag matching the version with prepended "v" (e.g. `v1.0.0`)
-   GitHub workflow will automatically publish npm package (https://www.npmjs.com/package/heatmap-component)
-   The files will become available via jsDelivr
    -   https://cdn.jsdelivr.net/npm/heatmap-component@latest/build/heatmap-component.js
    -   https://cdn.jsdelivr.net/npm/heatmap-component@latest/build/heatmap-component.css
    -   It might take up to 12 hours before `@latest` starts pointing to the new version. You can also replace `@latest` by a specific version (e.g. `@1.0.0`).
