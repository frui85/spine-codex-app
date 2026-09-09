# Renderer source modules

`spine-view.js` is the deterministic release artifact injected into Codex
Desktop. Its source of truth is the ordered set of `*.jsfrag` modules in this
directory.

The fragments intentionally share one browser IIFE and are not independently
executable JavaScript files. Their boundaries keep protocol/cache logic,
session state, Spawn behavior, Tree projection, DOM mounting, settings, and
lifecycle wiring separate without adding a runtime module loader or a bundler.

After changing a fragment, regenerate the release artifact:

```sh
npm run build:renderer
```

`npm run check` runs the generator in `--check` mode and fails if the checked-in
artifact differs by even one byte.
