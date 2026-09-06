# SpineCodex App v0.3.3.5

[中文发布说明](RELEASE_NOTES_v0.3.3.5_ZH.md)

This App-only release restores startup on Codex Desktop `26.901.51231`, which
ships with the Electron `nodeOptions` and `nodeCliInspect` fuses disabled. The
official `@spinejit/spine-codex@0.3.3` baseline remains unchanged.

## Compatibility

| Component | Release status |
|---|---|
| SpineCodex App | 0.3.3.5 |
| SpineCodex local minimum | 0.2.2 |
| SpineCodex recommended baseline | 0.3.3 |
| SpineCodex 0.3.3 Codex-compatible identity | 0.147.0 |
| Validated Codex Desktop builds | 26.810.41047, 26.818.41509, 26.825.51511, 26.901.20858, 26.901.51231 |

## Private inspectable Desktop clone

When the installed Desktop disables its Node CLI Inspector fuse, neither
`--inspect*` nor `SIGUSR1` can open the main-process Inspector, so v0.3.3.4
stopped in preflight. The launcher now:

- clones the installed bundle with APFS `clonefile` into
  `~/Library/Application Support/SpineCodex App/inspectable-desktop/`
  (no additional disk space on the same volume);
- flips exactly one byte in the copy's Electron fuse wire so `nodeCliInspect`
  is enabled again;
- re-signs the copy ad hoc with the hardened runtime, keeping its capability
  entitlements and leaving out the provisioning-only ones
  (`application-identifier`, `keychain-access-groups`, `application-groups`,
  `com.apple.developer.*`);
- verifies the copy with `codesign --verify --deep --strict`, records a
  manifest, and launches the copy paused on a loopback-only `--inspect-brk`
  port so the main hook loads before the first script runs;
- waits up to 60 s for that Inspector with one deadline shared by the primary
  and fallback ports, because the first execution of a freshly signed clone
  spends several seconds in AMFI validation of the Electron framework before
  the paused main process listens.

The clone is reused while the installed Desktop is unchanged and rebuilt after
a Desktop update. `SPINE_CODEX_DISABLE_DESKTOP_CLONE=1` restores the previous
fail-closed preflight error; `SPINE_CODEX_DESKTOP_CLONE_ROOT` relocates the
clone.

Known limits of the clone: push notifications and keychain sharing with other
OpenAI apps are unavailable inside it, and macOS may ask again for permissions
such as Automation, camera, or microphone because its code signature differs
from the original.

The original ChatGPT.app bundle, official SpineCodex CLI, and user sessions are
not modified.

## Validation

- The wrapper test suite passes, including the new fuse-wire, entitlement, and
  clone lifecycle regression tests.
- On macOS 26.6.2 with Desktop `26.901.51231` (`nodeOptions` and
  `nodeCliInspect` fuses off), a clone prepared with this recipe passed
  `codesign --verify --deep --strict`, started with `--inspect-brk`, exposed
  the loopback Node Inspector target after about 7 s, and reported
  `Spine Tree ready` about 25 s after `spine-app` started with a freshly
  prepared clone (8.5 s); the read-only bundle contract check accepts this
  Desktop build.
- Run `spine-app --diagnose` and then `spine-app` once after installing to
  confirm the full launch path on your machine; the first launch prepares the
  clone and takes a few seconds longer.
