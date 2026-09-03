# SpineCodex App v0.3.3.4

[中文发布说明](RELEASE_NOTES_v0.3.3.4_ZH.md)

This App-only release fixes startup on current Codex Desktop builds where the
Electron `NODE_OPTIONS` and Node CLI Inspector fuses are disabled. The official
`@spinejit/spine-codex@0.3.3` baseline remains unchanged.

## Compatibility

| Component | Release status |
|---|---|
| SpineCodex App | 0.3.3.4 |
| SpineCodex local minimum | 0.2.2 |
| SpineCodex recommended baseline | 0.3.3 |
| SpineCodex 0.3.3 Codex-compatible identity | 0.147.0 |
| Validated Codex Desktop builds | 26.810.41047, 26.818.41509, 26.825.51511, 26.901.20858 |

## macOS Inspector startup fix

When the Desktop fuses disable `--inspect-brk`, the launcher now starts a
loopback-only `--inspect-port`, triggers the Inspector through `SIGUSR1` on the
newly launched Desktop PID, pauses the process through CDP, and verifies that
the inspected PID is the expected one before loading the main-process hook.
If no safe target is available, startup remains fail closed.

The original ChatGPT.app bundle, official SpineCodex CLI, and user sessions are
not modified.

## Validation

- `npm run check` passes, including static release-boundary and runtime
  Inspector coverage.
- `spine-app --diagnose --json` continues to pass against Desktop `26.901.20858`
  with `NODE_OPTIONS fuse: off`.
