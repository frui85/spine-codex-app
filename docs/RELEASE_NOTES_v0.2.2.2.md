# SpineCodex App v0.2.2.2

This wrapper revision continues to require an externally installed SpineCodex
0.2.2 or newer. SpineCodex and Codex Desktop are not bundled.

## Highlights

- Supports the Electron bootstrap and forwarded SSH-agent layout in current
  Codex Desktop build `26.803.41515` while continuing to fail closed on unknown
  app-server bootstrap structures.
- Makes Spine Tree mounting self-healing across legacy summary markers, sibling
  summary surfaces, and geometry-compatible replacements without depending on
  translated labels or generated CSS class names.
- Reloads the current renderer source from its verified on-disk path whenever
  Electron rebuilds the main surface, preventing a long-running main process
  from reviving an obsolete renderer after a crash.
- Keeps the renderer recovery path event-driven, with no polling or guardian
  process, and validates the source identity before reinjection.
- Continues to publish macOS Apple Silicon and Intel assets only. The Windows
  workflow remains disabled pending further real-device validation and signing.

## Install

Download the DMG matching your Mac, drag **SpineCodex App** to Applications,
quit Codex Desktop completely, and open SpineCodex App.

- `arm64` — Apple Silicon
- `x64` — Intel

This release is ad-hoc signed and not notarized. macOS may require right-clicking
**Open** or allowing it once in **System Settings → Privacy & Security**.
