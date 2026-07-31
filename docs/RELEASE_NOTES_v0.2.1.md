# SpineCodex App v0.2.1

First public release, tracking the minimum supported SpineCodex version 0.2.1.

## Install

Download the DMG matching your Mac:

- `arm64` — Apple Silicon
- `x64` — Intel

Drag **SpineCodex App** to Applications, quit ChatGPT completely, then open SpineCodex App.

Codex Desktop and SpineCodex are required external installations. They are **not bundled or installed** by this release. SpineCodex can be installed separately with:

```sh
npm install -g @spinejit/spine-codex@latest
```

The wrapper discovers both paths automatically. First run reports every missing requirement without changing the system.

## Highlights

- Interactive Spine Tree embedded in pinned and floating Codex summary surfaces
- Native right-sidebar node details, compaction history, Spawn navigation, and child naming
- Local and SSH-host SpineCodex selection with truthful v0.2.1 compatibility checks
- Ten-locale i18n and Codex-native motion/reduced-motion behavior
- Architecture-specific standalone wrapper DMGs with a checksum-verified Node runtime
- No `app.asar` patch, watchdog, bundled SpineCodex, or bundled Codex Desktop

Tested with ChatGPT/Codex Desktop build `26.727.40816` on macOS. The App bundle is ad-hoc signed and not notarized; on first launch, macOS may require right-clicking **Open** or allowing it in Privacy & Security.
