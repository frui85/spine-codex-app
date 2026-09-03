# SpineCodex App v0.3.3.3

[中文发布说明](RELEASE_NOTES_v0.3.3.3_ZH.md)

This App-only release adapts SpineCodex App to the current Codex Desktop
`26.901.20858` while keeping the official `@spinejit/spine-codex@0.3.3`
baseline unchanged.

## Compatibility

| Component | Release status |
|---|---|
| SpineCodex App | 0.3.3.3 |
| SpineCodex local minimum | 0.2.2 |
| SpineCodex recommended baseline | 0.3.3 |
| SpineCodex 0.3.3 Codex-compatible identity | 0.147.0 |
| Validated Codex Desktop builds | 26.810.41047, 26.818.41509, 26.825.51511, 26.901.20858 |

## macOS fuse fallback

Recent Codex Desktop builds can disable the Electron `NODE_OPTIONS` fuse. The
launcher now starts the Desktop executable directly with a fresh loopback-only
`--inspect-brk` port, loads the SpineCodex main-process hook through the Node
Inspector protocol, resumes the paused process, and closes the Inspector
connection. Renderer injection still waits for the verified `ready` handshake.

The bundle contract is scanned read-only before launch. Unknown, ambiguous, or
failed Inspector states remain fail closed.

## Validation

- `spine-app --diagnose --json` passes against Desktop `26.901.20858` with
  `NODE_OPTIONS fuse: off` and a compatible bundle contract.
- Main Inspector injection tests, renderer tests, and release-boundary tests
  pass locally.
