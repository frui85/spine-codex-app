# SpineCodex App v26.901.51231

[中文发布说明](RELEASE_NOTES_v26.901.51231_ZH.md)

App versions now follow the supported Codex Desktop version. This release targets Desktop `26.901.51231` and builds on App `0.3.3.6`.

| Component | Release status |
|---|---|
| SpineCodex recommended baseline | 0.3.3 |
| Official SpineCodex / Codex CLI compatibility | 0.3.3 / 0.147.0 |
| Supported fork / Codex CLI compatibility | 0.4.1 / 0.153.4 |
| Fork source | https://github.com/xiurui-pan/SpineCodex |

The official 0.3.3 CLI follows an older Codex baseline. Fork 0.4.1 adds support for the newer 0.153.4 baseline. Official CLI updates will continue to receive regression testing; fork support supplements official support.

## Startup modes and menu bar

- External adapter remains the default. Opt-in clone mode preserves main-hook replay recovery and SSH bootstrap protection.
- External adapter mode adopts upstream's original signed Desktop + local CLI adapter + Renderer supervisor architecture.
- Auto mode attempts clone startup first and falls back to the external adapter only after the failed instance stops.
- A native macOS menu bar item shows the actual mode, Desktop version, CLI product and compatibility versions, baseline match, and connection state.
- Mode changes ask to restart Desktop, wait for it to quit, and commit preferences only after readiness. Failed switches attempt to restore the previous mode.
- External mode verifies zsh PATH ordering and observes the actual app-server initialize response through the adapter. It provides no clone-only replay recovery or SSH bootstrap patches.
- The supervisor reconnects while its owned Desktop process remains alive and checks targets at one-second intervals. Only the exact main Renderer target is eligible.

Both startup modes require real-device regression for each new Desktop build. A version/baseline match is not a guarantee for every CLI feature or proof of binary provenance. Image generation remains disabled. Windows release automation remains disabled.

## Validation performed for this release

- Desktop 26.901.51231 with official SpineCodex 0.3.3 / CLI 0.147.0: actual external adapter and clone startup, initialize and app protocol probes.
- Same Desktop with fork 0.4.1 / CLI 0.153.4: both startup modes, native status UI, external → clone → external restart, and successful preference persistence.
- Actual auto fallback with clone disabled reaches adapter initialization and Renderer readiness.
- Unit regression covers target replacement, CDP outage reconnection, reload registration, failed mode changes, and recovery errors in external mode. Direct Desktop UI reload was not exercised in this session.
- Native helpers compile for arm64 and x86_64. Intel runtime behavior still requires an Intel Mac regression.

For future official CLI updates, run `npm run regress:cli -- /absolute/path/to/spine-codex`, then repeat both Desktop startup modes and restart/recovery checks. A passing initialize probe alone does not certify all agent features.
