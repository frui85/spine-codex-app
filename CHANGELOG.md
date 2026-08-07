# Changelog

## Unreleased

- Adds a Windows x64 portable build with native GUI and CLI-shim executables, an independently verified Node.js runtime, Codex Store-app discovery, and no bundled upstream binaries.
- Finds the Windows Store ChatGPT/Codex executable from its stable AppX package identity and manifest instead of relying on the Start menu display name.
- Identifies and patches the app-server version check by its stable error-prefix and comparator structure instead of minified export names, restoring SpineCodex SSH compatibility after Codex Desktop updates.
- Keeps the Electron main hook installed across deferred and out-of-order App bundle loading, identifies both SSH targets independently by content, and requires a verified launcher-to-main-process readiness handshake before reporting startup success.
- Uses the portable `spine-codex` command name for both local and remote `CODEX_CLI_PATH`, eliminating the App's absolute-path-to-`codex` fallback after bundle updates.
- Makes remote app-server bootstrap idempotent: serializes concurrent reconnects, reuses a healthy SpineCodex server, replaces a stale or official-Codex socket owner only after same-UID verification, and waits for two successful Unix-socket probes before starting the proxy.
- Restricts the Electron main preload to the browser main thread so worker processes cannot overwrite its verified readiness status.
- Injects the Windows main-process hook through a temporary loopback-only `--inspect-brk` session before Codex executes its main script, bypassing Store builds that ignore `NODE_OPTIONS`; startup resumes only after the hook loads and still requires the authoritative readiness handshake before renderer injection.
- Restores Spine View automatically after a Codex renderer crash or BrowserWindow replacement by keeping two narrow Electron lifecycle listeners in the verified main hook; the renderer source is SHA-256 checked and injected only into `app://-/index.html`, without polling or a guardian process.

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
