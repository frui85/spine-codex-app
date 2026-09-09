# SpineCodex App v0.3.3.6

[中文发布说明](RELEASE_NOTES_v0.3.3.6_ZH.md)

Fixes startup when a private inspectable Desktop clone changes independently
of the installed application. The launcher previously reused that clone based
only on the source application's identity and its enabled Inspector fuse.
An incompatible clone could then fail with `Codex local CLI error marker was not found`.

The launcher now records the finished clone's identity and `app.asar` SHA-256
after signing and verifies both before reuse. Changed clones and legacy caches
without a recorded clone identity are rebuilt from the installed Desktop.

## Compatibility

| Component | Release status |
|---|---|
| SpineCodex App | 0.3.3.6 |
| SpineCodex local minimum | 0.2.2 |
| SpineCodex recommended baseline | 0.3.3 |
| SpineCodex 0.3.3 Codex-compatible identity | 0.147.0 |
| Validated Codex Desktop builds | 26.810.41047, 26.818.41509, 26.825.51511, 26.901.20858, 26.901.51231 |

This release restores the compatible installed Desktop copy; it does not add
compatibility for Desktop `26.903.61454`, the changed private clone observed
during diagnosis. The original application and user sessions are unchanged.
The first launch rebuilds old clone caches once.

Local and fork maintenance branches are consolidated into `main`, including
the SpineCodex / VS Code integration wiki. Current compatibility, replay recovery,
and app catalog transition fixes are retained.

## Validation

- Full wrapper checks, clone lifecycle regressions, renderer tests, and SSH hook tests.
- Regression coverage for independent clone version changes, same-size archive
  changes, and legacy manifests without clone identity.
- Real macOS startup from a rebuilt Desktop `26.901.51231` clone reports
  `Spine Tree ready`; subsequent preparation reuses the verified clone.
- The installed repaired wrapper passes strict code-signature verification.

GitHub Actions builds Apple Silicon and Intel macOS DMGs and publishes their
SHA-256 checksums. Windows release packaging remains disabled pending validation.
