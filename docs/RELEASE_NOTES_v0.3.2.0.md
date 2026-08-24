# SpineCodex App v0.3.2.0

[中文发布说明](RELEASE_NOTES_v0.3.2.0_ZH.md)

This release adapts SpineCodex App to SpineCodex 0.3.2 without replacing the
existing Tree/Spawn notifications or removing the 0.2.2 Apps compatibility
adapter. Codex Desktop and SpineCodex remain external requirements and are not
bundled.

## Compatibility

| Component | Release status |
|---|---|
| SpineCodex App | 0.3.2.0 |
| SpineCodex local minimum | 0.2.2 |
| SpineCodex recommended baseline | 0.3.2 |
| SpineCodex 0.3.2 Codex-compatible identity | 0.147.0 |
| SpineCodex remote minimum | 0.2.2 |
| Validated Codex Desktop builds | 26.810.41047, 26.818.41509 |
| OpenAI Codex 0.149.1 | Not a SpineCodex baseline for this release |

The complete machine-readable matrix ships as `compatibility.json`.

## Added and changed

- The launcher now resolves the SpineCodex product version from the installed
  npm package and records it separately from `codex-cli --version`. If product
  metadata is unavailable, diagnostics report `unknown` and use compatibility
  identity plus a live app-server probe.
- `--diagnose --json` emits a stable schema covering version identity, Apps
  protocol mode, Desktop version and bundle contract, renderer checksum, and
  local/remote requirements.
- macOS diagnostics inspect the installed `app.asar` read-only. Startup is
  rejected unless the SSH main-process target, version check, and local CLI
  selector match uniquely, with version and selector in the same shared
  bundle. Windows retains the authoritative runtime Inspector handshake.
- SpineCodex 0.3.2 uses native `app/installed` and `app/read`. SpineCodex 0.2.2
  retains the one-time paginated `app/list` fallback.
- Stable `spine_spawn` is visible and writable in Settings. Beta Memory
  Projection remains visible; removed and unknown stable features remain
  hidden.
- Settings show the selected host, local product/compatibility versions, Spawn
  default, and Memory Projection state. Remote feature state is fetched per
  host and never inherits local version claims.
- Generated SpineCodex 0.3.2 Tree and Spawn schemas are pinned as integrity-
  checked test fixtures. Public notification method names and normalized
  Renderer data entry points are unchanged.
- Renderer source is split into ordered responsibility modules under
  `renderer/`; release builds still inject one generated `spine-view.js` and
  reject byte drift.

## Known boundary

`image_generation` remains disabled. SpineCodex 0.3.2 marks the feature stable,
but this App release does not enable it until real image generation, message
replay, Spine Tree update, and recovery behavior pass an end-to-end gate.

## Diagnose

Quit Codex Desktop completely, then run:

```sh
./spine-app --diagnose
./spine-app --diagnose --json
```

The Apps protocol result is one of `native`, `legacy-fallback`, or
`unavailable`. On macOS, a compatible Desktop result also names the unique main
and shared bundle candidates.

## Install

Install SpineCodex separately, preferably 0.3.2, then install the DMG matching
the Mac architecture and launch **SpineCodex App** instead of opening Codex
Desktop directly.

```sh
npm install -g @spinejit/spine-codex@0.3.2
spine-codex --version
```

The macOS release remains ad-hoc signed and is not notarized. Windows release
automation remains disabled pending broader real-device and signing validation.
