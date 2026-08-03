# SpineCodex App v0.2.2

This release tracks SpineCodex v0.2.2 and requires an externally installed SpineCodex 0.2.2 or newer.

## Highlights

- Restores remote SpineCodex startup on current Codex Desktop builds by identifying the Electron SSH entrypoint from its internal CLI-selector structure instead of a generated bundle filename.
- Persists structured Spine Spawn task names before live progress starts, keeping native child-agent list and header names across interrupted parent turns and App restarts.
- Keeps local and SSH-host version checks truthful while raising the minimum supported SpineCodex release to 0.2.2.

## Install

Download the DMG matching your Mac:

- `arm64` — Apple Silicon
- `x64` — Intel

Drag **SpineCodex App** to Applications, quit ChatGPT completely, then open SpineCodex App.

Codex Desktop and SpineCodex are required external installations. They are **not bundled, downloaded, or installed** by this release. Install or upgrade SpineCodex separately:

```sh
npm install -g @spinejit/spine-codex@0.2.2
```

The wrapper discovers both paths automatically. This build is ad-hoc signed and not notarized; macOS may require right-clicking **Open** or allowing it once in **System Settings → Privacy & Security**.
