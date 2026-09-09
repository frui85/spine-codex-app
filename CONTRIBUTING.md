# Contributing

Issues and focused pull requests are welcome. Keep changes lightweight: no renderer polling, whole-page persistent observers, React Fiber scanning, or changes to `app.asar`.

Before opening a pull request, run:

```sh
npm run check
node spine-app.mjs --diagnose
node spine-app.mjs --diagnose --json
```

Changes that depend on Codex Desktop internals should state the tested App build and fail closed when their structural marker is missing.

Edit Renderer source in the ordered `renderer/*.jsfrag` modules, then run
`npm run build:renderer`; do not hand-edit the generated `spine-view.js` alone.
CLI compatibility changes must update `compatibility.json` and the generated
Tree/Spawn fixtures when their schema changes.
