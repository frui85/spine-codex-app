# SpineCodex App v0.2.2.3

[中文修复说明](https://github.com/izumedonabe/SpineCodexApp/blob/v0.2.2.3/docs/RELEASE_NOTES_v0.2.2.3_ZH.md)

This wrapper revision continues to require an externally installed SpineCodex
0.2.2 or newer. SpineCodex and Codex Desktop are not bundled.

## Highlights

- Prevents the `app/list/updated` feedback loop observed when SpineCodex 0.2.2
  is used with Codex Desktop build `26.803.41515`.
- Deduplicates consecutive, semantically identical app-catalog snapshots in
  the local app-server transport before they reach Desktop, while forwarding
  every genuine transition, including a return to a previously seen state.
  This stops identical snapshots from repeating the 1,000 + 1,000 + 612 item
  pagination cycle without relying on renderer listener order.
- Gives Desktop's local CLI selector a dedicated absolute path to the packaged
  private shim. This keeps the output filter in the process chain even after
  Desktop reloads the login-shell environment and replaces `PATH`. Remote SSH
  continues to resolve the portable `spine-codex` command on each host.
- Restricts the full Spine View injection to the primary Codex page instead of
  also attaching it to the `avatar-overlay` renderer.
- Removes the renderer's time-only burst guard so legitimate rapid catalog
  changes are never hidden from Desktop.
- Retains the Electron bootstrap, renderer recovery, and forwarded SSH-agent
  compatibility introduced in v0.2.2.2.

## Install

Download the DMG matching your Mac, drag **SpineCodex App** to Applications,
quit Codex Desktop completely, and open SpineCodex App.

- `arm64` — Apple Silicon
- `x64` — Intel

This release is ad-hoc signed and not notarized. macOS may require right-clicking
**Open** or allowing it once in **System Settings → Privacy & Security**.
