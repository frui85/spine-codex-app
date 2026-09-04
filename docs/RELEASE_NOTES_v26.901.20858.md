# SpineCodex App v26.901.20858

[中文发布说明](https://github.com/izumedonabe/spine-codex-app/blob/v26.901.20858/docs/RELEASE_NOTES_v26.901.20858_ZH.md)

> Release date: 2026-09-05
>
> Guaranteed Desktop version: ChatGPT/Codex Desktop `26.901.20858`
>
> Required SpineCodex version: `0.3.3` or newer
>
> Assets: macOS Apple Silicon and Intel DMGs

## Compatibility contract

SpineCodex App releases now use the version number of the Codex Desktop build
they adapt to and verify.

| Installed ChatGPT/Codex Desktop | Compatibility status |
|---|---|
| `< 26.901.20858` | Unsupported by this release |
| `= 26.901.20858` | Tested and guaranteed compatible |
| `> 26.901.20858` | Unverified and not guaranteed compatible |

Install the SpineCodex App release whose version exactly matches the installed
Desktop version. This contract avoids implying compatibility across Electron,
Desktop bundle, protocol, or renderer changes that have not been tested.

## Why this release

Earlier wrapper releases used Electron's supported
`NODE_OPTIONS=--require` path to load a compatibility hook into the Codex
Desktop main process at startup; they did not modify the official App on disk.
The Electron build used by Codex Desktop `26.901.20858` disables both the
`NODE_OPTIONS` and Node Inspector fuses, removing that Node main-process
injection path. The existing hook can still recognize the updated Desktop
bundle, but there is no longer a supported channel that can deliver it to the
main process.

This release does not bypass Electron's security boundary or patch and re-sign
the official App. It moves the compatibility boundary to an external CLI
adapter and restores renderer behavior through a persistent, loopback-only CDP
supervisor. That upstream removal of the Node injection entry point is the
direct reason for this architecture change and version realignment.

## What changed

- Restores support for Desktop `26.901.20858`, whose Electron build disables
  the `NODE_OPTIONS` and Node Inspector main-process injection paths used by
  earlier wrapper releases.
- Uses Desktop's supported `CODEX_CLI_PATH=spine-codex` boundary. On macOS, a
  temporary login-shell environment resolves the local command to the private
  adapter, which launches the separately installed, unmodified SpineCodex.
- Leaves native SSH command resolution on each remote host. No remote adapter
  is installed and no local absolute path is sent over SSH.
- Adds a loopback-only CDP supervisor that remains attached to the exact main
  `app://-/index.html` target and restores Spine View after page reloads or
  renderer target replacement.
- Keeps the local app-server protocol adapter, output filtering, and temporary
  `image_generation` disablement without modifying SpineCodex itself.

## Requirements and boundaries

- macOS 14 or newer.
- ChatGPT/Codex Desktop exactly `26.901.20858` for guaranteed compatibility.
- SpineCodex `0.3.3` or newer locally and on every SSH host. It must be visible
  in the corresponding login shell's `PATH`.
- ChatGPT must be fully quit before SpineCodex App launches it; the required
  CLI environment and CDP port cannot be added to an already-running process.

The DMGs contain only this wrapper and a checksum-pinned Node.js runtime. They
do not contain, download, patch, or re-sign ChatGPT/Codex Desktop or
SpineCodex. Windows release automation remains disabled and no Windows asset is
claimed by this release.

## Validation

- Full source and release-boundary test suite.
- Real local app-server initialization through the private adapter, reporting
  upstream-compatible `codex-cli 0.147.0` from SpineCodex 0.3.3.
- Real Desktop `26.901.20858` renderer attachment and recovery after
  `Page.reload`.
- Strict ad-hoc code-signature and DMG integrity checks in the release build.

This release is ad-hoc signed and not notarized. macOS may require opening it
once through Finder's **Open** command or allowing it in **System Settings →
Privacy & Security**. SHA-256 files are published beside both DMGs.
