# Changelog

> [简体中文](CHANGELOG_ZH.md) · **English**

## Unreleased

## v0.3.3.4 — 2026-09-03

App-only startup fix for current Codex Desktop builds with Electron Inspector
fuses disabled.

- Replaces the ineffective macOS `--inspect-brk` fallback with a runtime
  Inspector trigger sent only to the newly launched Desktop process.
- Pauses through CDP, verifies the inspected PID, and keeps startup fail-closed
  when the target is missing or belongs to another process.
- Keeps the official `@spinejit/spine-codex@0.3.3` CLI and user session data
  unchanged.

## v0.3.3.3 — 2026-09-03

App-only compatibility update for current Codex Desktop `26.901.20858`.

- Adds the new Desktop build to the validated bundle matrix.
- Uses a loopback-only Electron main-process Inspector when Desktop disables
  the `NODE_OPTIONS` fuse, while keeping the official
  `@spinejit/spine-codex@0.3.3` CLI unchanged.
- Keeps startup fail-closed when the bundle contract or Inspector handshake
  cannot be verified.

## v0.3.3.2 — 2026-09-01

App-only startup readiness update validated against the unchanged official
`@spinejit/spine-codex@0.3.3` baseline.

- Replaces the macOS launcher's fixed five-second main-hook wait with a
  20-second initial deadline and progress-aware sliding extensions.
- Recognizes only the hook's known initialization states as progress, retains
  a 30-second hard limit, and performs bounded final state reads before
  reporting failure.
- Distinguishes a preload that never reported from a loaded hook whose
  asynchronous Renderer or app-server recovery integration did not finish.
- Adds deterministic virtual-clock coverage for delayed readiness, progress
  deadlines, hard limits, final grace, malformed state, and fail-closed paths.
- Validates the bundle and complete startup path on ChatGPT/Codex Desktop
  `26.825.51511` (build 7377).

## v0.3.3.1 — 2026-08-31

App-only durability recovery update validated against the unchanged official
`@spinejit/spine-codex@0.3.3` baseline.

- Recovers the exact context-plan failure caused when SpineCodex accepts a
  `spine.close` or `spine.next` memory whose projected fragment exceeds 8,000
  UTF-8 bytes.
- Validates the source rollout, matching tool call, accepted output, and
  reported fragment size before cloning history into a replacement thread.
- Truncates only the cloned memory at a UTF-8 boundary within the observed
  projection budget; the original session and installed CLI remain unchanged.
- Handles both the first context-plan fatal and its durability-faulted wrapper,
  while unrelated and boundary-size failures remain fail closed.

## v0.3.3.0 — 2026-08-25

Compatibility and recovery release validated against SpineCodex 0.3.3 while
retaining the SpineCodex 0.2.2 minimum.

- Updates the recommended SpineCodex product baseline to 0.3.3 while retaining
  its Codex-compatible identity 0.147.0.
- Recovers inherited subagent conversations affected by the exact
  `sampling commit does not match its sampling-started record` durability
  mismatch. The App reconstructs the effective native history read-only,
  validates the parent and compaction boundary, resumes into a replacement
  thread, and persists the old-to-new thread alias.
- Handles the real app-server ordering where `thread/status/changed` may arrive
  before the resume response, without exposing the intercepted fatal error.
- Keeps unrelated replay and durability failures fail closed.
- Regenerates and pins the 0.3.3 Tree/Spawn notification contracts; their
  schemas remain compatible with the prior App integration.

## v0.3.2.0 — 2026-08-24

Compatibility release validated against SpineCodex 0.3.2 while retaining the
SpineCodex 0.2.2 minimum.

- Separates the SpineCodex product version from its Codex-compatible identity;
  0.3.2 is reported alongside compatibility version 0.147.0.
- Adds stable JSON diagnostics for Apps protocol capability, installed Desktop
  identity, renderer integrity, and local/remote compatibility requirements.
- Scans the installed macOS `app.asar` read-only and fails closed unless the
  main process, version check, and local CLI selector contracts match uniquely.
- Supports native `app/installed` and `app/read` in SpineCodex 0.3.2 while
  preserving the paginated 0.2.2 `app/list` adapter.
- Restores the stable `spine_spawn` feature in Settings, keeps beta Memory
  Projection visible, and isolates local and remote host status.
- Pins generated 0.3.2 Tree/Spawn schemas as contract fixtures and splits the
  renderer into ordered source modules while preserving one byte-identical
  injection artifact.
- Keeps image generation disabled pending a dedicated end-to-end gate and does
  not treat OpenAI Codex 0.149.1 as a SpineCodex baseline.

## v0.2.2.5 — 2026-08-14

Wrapper-only revision; the minimum supported SpineCodex version remains 0.2.2.

- Supports the grouped SSH app-server bootstrap structure introduced in
  ChatGPT Desktop `26.810.41047`, including its secure directory setup,
  forwarded SSH-agent preparation, and log initialization.
- Replaces the complete grouped cleanup expression before injecting the
  SpineCodex bootstrap, preventing unmatched shell subshells while retaining
  fail-closed compatibility checks for unknown bundles.

## v0.2.2.4 — 2026-08-11

Wrapper-only revision; the minimum supported SpineCodex version remains 0.2.2.

- Adds a capability-probing app-server protocol adapter for Codex Desktop's
  `app/installed` and `app/read` lifecycle. SpineCodex 0.2.2 falls back once to
  paginated `app/list`, coalesces concurrent loads, maps the documented runtime
  and metadata responses, and absorbs fresh `forceRefresh` feedback without
  repeated unsupported-method errors or catalog reloads. Future backends with
  native support pass through unchanged.
- Keeps the native `avatar-overlay` window untouched while making transient
  `pluginDisplayNames` enrichment monotonic in the local app-server transport,
  so alternating multi-megabyte catalog snapshots converge instead of
  repeatedly reaching either Desktop renderer.

## v0.2.2.3 — 2026-08-10

Wrapper-only revision; the minimum supported SpineCodex version remains 0.2.2.

- Breaks the `app/list/updated` feedback loop between SpineCodex 0.2.2 and Codex Desktop `26.803.41515` by deduplicating consecutive, semantically identical catalog snapshots in the local app-server transport before they reach Desktop.
- Pins only Desktop's local CLI selector to the packaged private shim, preventing a login-shell `PATH` refresh from bypassing the output filter while keeping remote SSH on the portable `spine-codex` command name.
- Prevents multi-core CPU saturation, repeated 2,612-app payload deserialization, renderer memory growth, and sustained thermal load caused by that loop.
- Restricts Spine View recovery injection to the primary Codex surface and excludes the full `avatar-overlay` renderer.
- Forwards every genuine catalog transition, including `A → B → A`, and removes the renderer's time-only burst guard.

## v0.2.2.2 — 2026-08-10

Wrapper-only revision; the minimum supported SpineCodex version remains 0.2.2.

- Defers Electron renderer-recovery setup when a current Codex build runs Node preloads before registering `electron/main`, while keeping the SSH bundle patch synchronous and preserving legacy `electron` compatibility.
- Preserves Codex Desktop's forwarded SSH-agent setup while adapting the remote SpineCodex bootstrap to the nested cleanup structure introduced in build `26.803.41515`.
- Makes summary mounting self-healing across legacy markers, sibling surfaces, and geometry-compatible replacements without relying on translated labels or generated CSS classes.
- Reloads the current on-disk renderer source whenever Electron rebuilds the main surface, preventing a long-running main process from reviving an obsolete renderer revision after a crash.

## v0.2.2.1 — 2026-08-07

Wrapper-only revision; the minimum supported SpineCodex version remains 0.2.2.

- Adds a Windows x64 portable build with native GUI and CLI-shim executables, an independently verified Node.js runtime, Codex Store-app discovery, and no bundled upstream binaries.
- Finds the Windows Store ChatGPT/Codex executable from its stable AppX package identity and manifest instead of relying on the Start menu display name.
- Identifies and patches the app-server version check by its stable error-prefix and comparator structure instead of minified export names, restoring SpineCodex SSH compatibility after Codex Desktop updates.
- Keeps the Electron main hook installed across deferred and out-of-order App bundle loading, identifies both SSH targets independently by content, and requires a verified launcher-to-main-process readiness handshake before reporting startup success.
- Uses the portable `spine-codex` command name for both local and remote `CODEX_CLI_PATH`, eliminating the App's absolute-path-to-`codex` fallback after bundle updates.
- Makes remote app-server bootstrap idempotent: serializes concurrent reconnects, reuses a healthy SpineCodex server, replaces a stale or official-Codex socket owner only after same-UID verification, and waits for two successful Unix-socket probes before starting the proxy.
- Restricts the Electron main preload to the browser main thread so worker processes cannot overwrite its verified readiness status.
- Injects the Windows main-process hook through a temporary loopback-only `--inspect-brk` session before Codex executes its main script, bypassing Store builds that ignore `NODE_OPTIONS`; startup resumes only after the hook loads and still requires the authoritative readiness handshake before renderer injection.
- Restores Spine View automatically after a Codex renderer crash or BrowserWindow replacement by keeping two narrow Electron lifecycle listeners in the verified main hook; the renderer source is SHA-256 checked and injected only into `app://-/index.html`, without polling or a guardian process.
- Adapts the interactive Spine detail tab to Codex Desktop's nested right-panel tab strip, restoring node clicks and preventing an endless detail-mount retry after the App layout update.
- Adds a tag-driven GitHub Actions release pipeline that validates the source version, builds and verifies both macOS architectures, and publishes only after all assets are ready; Windows workflow code remains disabled.

## v0.2.2 — 2026-08-03

Tracks SpineCodex v0.2.2 and raises the minimum supported SpineCodex version to 0.2.2.

- Persists structured Spine Spawn task names before live progress, preserving native child-agent list and header names across interrupted parent turns and App restarts.
- Identifies the Codex Electron SSH entrypoint by its internal CLI-selector structure instead of assuming the older `main--HASH.js` filename, restoring remote SpineCodex startup on newer App builds that emit `main-HASH.js`.

## v0.2.1 — 2026-07-31

First public release, tracking SpineCodex v0.2.1.

- Launches the installed Codex Desktop app with an installed SpineCodex backend.
- Adds an embedded, interactive, localized Spine Tree to native summary surfaces.
- Adds Spine feature controls and Spawn child-agent navigation.
- Uses SpineCodex for local and connected SSH-host app servers.
- Ships standalone macOS arm64 and x64 DMGs containing only this wrapper and its Node runtime.
- Auto-discovers Codex Desktop and SpineCodex; neither dependency is bundled or installed.
- Follows Codex's runtime `localeOverride` setting across repeated in-app language changes.
