# Contributing

Issues and focused pull requests are welcome. Keep changes lightweight: no renderer polling, whole-page persistent observers, React Fiber scanning, or changes to `app.asar`.

Before opening a pull request, run:

```sh
npm run check
node spine-app.mjs --diagnose
```

Changes that depend on Codex Desktop internals should state the tested App build and fail closed when their structural marker is missing.
