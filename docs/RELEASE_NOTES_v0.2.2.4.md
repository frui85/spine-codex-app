# SpineCodex App v0.2.2.4

[中文修复说明](https://github.com/izumedonabe/SpineCodexApp/blob/v0.2.2.4/docs/RELEASE_NOTES_v0.2.2.4_ZH.md)

This wrapper-only revision continues to require an externally installed
SpineCodex 0.2.2 or newer. SpineCodex and Codex Desktop are not bundled.

## Highlights

- Adds a capability-probing local app-server adapter for Codex Desktop's
  `app/installed` and `app/read` lifecycle. Backends with native support pass
  through unchanged; SpineCodex 0.2.2 falls back once to paginated `app/list`
  and receives protocol-compatible installed-state and metadata responses.
- Coalesces concurrent legacy catalog loads, bounds per-thread catalog caches,
  absorbs fresh `forceRefresh` feedback, and hides all private probe IDs from
  Desktop.
- Makes transient `pluginDisplayNames` enrichment monotonic before Desktop
  fanout. Alternating multi-megabyte catalog snapshots converge after newly
  observed metadata has been forwarded, while real app changes still pass.
- Keeps the native `avatar-overlay` window untouched. Spine View remains
  restricted to the primary Codex surface; no renderer or Electron IPC patch
  is added to the overlay.

## Why this release

Codex Desktop build `26.803.41515` introduced an Apps lifecycle that calls
`app/installed` and `app/read`. SpineCodex 0.2.2 does not implement those
methods. The resulting unsupported-method fallback and catalog invalidation
could repeatedly fan large `app/list/updated` payloads into both Desktop
renderers, spending most active renderer time in message decoding and garbage
collection.

The compatibility boundary now lives in the packaged local stdio shim, before
messages reach either renderer. Remote SSH sessions still execute the remote
host's own `spine-codex` binary and therefore require a compatible remote
installation independently.

## Validation

- Full source check: 33/33 Node tests plus renderer and SSH suites.
- Real SpineCodex 0.2.2: `initialize → app/installed → app/read` returned four
  valid apps with no client errors or leaked private IDs.
- Native Codex backend: five apps passed through without entering legacy mode.
- A 2,624-app, 3.218 MiB catalog replay with 40 `forceRefresh` cycles completed
  without additional backend catalog loads.
- The installed arm64 build reduced the local wrapper from the observed
  high-CPU loop to 0.02% average CPU in a 10-second health sample.

## Install

Download the DMG matching your Mac, drag **SpineCodex App** to Applications,
quit Codex Desktop completely, and open SpineCodex App.

- `arm64` — Apple Silicon
- `x64` — Intel

This release is ad-hoc signed and not notarized. macOS may require right-clicking
**Open** or allowing it once in **System Settings → Privacy & Security**.
