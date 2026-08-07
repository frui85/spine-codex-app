# SpineCodex App v0.2.2.1

This wrapper revision continues to require an externally installed SpineCodex
0.2.2 or newer. SpineCodex and Codex Desktop are not bundled.

## Highlights

- Makes remote app-server startup deterministic: concurrent reconnects share a
  per-user lock, healthy SpineCodex servers are reused, and stale or official
  Codex socket owners are replaced only after same-user verification.
- Waits for the remote Unix socket to accept two connections before starting
  the proxy, replacing intermittent `socket hang up` and bootstrap timeout
  failures with useful diagnostics.
- Restores Spine View automatically after an Electron renderer crash or main
  window replacement using narrow, event-driven main-process listeners.
- Restores clickable Spine Tree details on current Codex Desktop builds by
  supporting the App's nested right-panel tab strip without relying on CSS
  classes or translated labels.
- Adds Windows Store discovery and a portable Windows x64 build implementation.
  The Windows GitHub Actions workflow remains disabled pending further
  real-device validation and code signing, so this release publishes macOS
  assets only.

## Install

Download the DMG matching your Mac, drag **SpineCodex App** to Applications,
quit Codex Desktop completely, and open SpineCodex App.

- `arm64` — Apple Silicon
- `x64` — Intel

This release is ad-hoc signed and not notarized. macOS may require right-clicking
**Open** or allowing it once in **System Settings → Privacy & Security**.
