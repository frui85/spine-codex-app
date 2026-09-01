# SpineCodex App v0.3.3.2

[中文发布说明](RELEASE_NOTES_v0.3.3.2_ZH.md)

This App-only update keeps the official `@spinejit/spine-codex@0.3.3`
baseline and removes a false startup failure caused by a fixed five-second
main-hook readiness timeout. Codex Desktop and SpineCodex remain separately
installed external requirements.

## Compatibility

| Component | Release status |
|---|---|
| SpineCodex App | 0.3.3.2 |
| SpineCodex local minimum | 0.2.2 |
| SpineCodex recommended baseline | 0.3.3 |
| SpineCodex 0.3.3 Codex-compatible identity | 0.147.0 |
| SpineCodex remote minimum | 0.2.2 |
| Validated Codex Desktop builds | 26.810.41047, 26.818.41509, 26.825.51511 |

The complete machine-readable matrix ships as `compatibility.json`.

## Progress-aware startup readiness

On slower launches, Desktop could reach `main-patched` within five seconds but
finish the Renderer and app-server recovery registrations shortly afterward.
The old launcher timed out first and incorrectly claimed that the preload or
Renderer injection had not loaded, even though the hook later became ready.

The launcher now:

- uses a 20-second initial readiness deadline on supported platforms;
- extends the active deadline by up to 10 seconds only when a recognized hook
  state advances through `installed`, `main-patched`, `version-patched`, or
  `electron-integrations-installed`;
- preserves a 30-second total hard limit so launch can never wait indefinitely;
- re-reads state at the deadline boundary and during one bounded 500 ms final
  grace window;
- still requires complete Renderer and app-server replay recovery readiness;
- reports separately whether no preload status was ever observed or a loaded
  hook failed to complete its asynchronous integrations;
- keeps incompatible, malformed, unknown, and incomplete `ready` states fail
  closed.

No polling or watchdog remains after startup completes.

## Validation

The complete launch flow, main hook, Renderer revision, package integrity, and
diagnostics were exercised on ChatGPT/Codex Desktop `26.825.51511` (build
7377). The previously observed hook became ready about seven seconds after
process start, which is now accepted without weakening the hard failure bound.

Automated coverage uses a virtual clock and includes a 7.2-second slow launch,
sliding progress deadlines, the 30-second hard limit, deadline-edge completion,
final grace, missing status, partial readiness, incompatible status, malformed
JSON, and non-target failure paths.

## Install

Install the official SpineCodex release separately, then install the matching
SpineCodex App DMG:

```sh
npm install -g @spinejit/spine-codex@0.3.3
spine-codex --version
```

The expected CLI compatibility output is `codex-cli 0.147.0`.
