# SpineCodex App v0.2.2.3

This wrapper revision continues to require an externally installed SpineCodex
0.2.2 or newer. SpineCodex and Codex Desktop are not bundled.

## Highlights

- Prevents the `app/list/updated` feedback loop observed when SpineCodex 0.2.2
  is used with Codex Desktop build `26.803.41515`.
- Deduplicates unchanged app-catalog notifications in the local app-server
  transport before they reach Desktop, while forwarding the first catalog and
  every genuinely changed catalog. This stops the repeated 1,000 + 1,000 + 612
  item pagination cycles without relying on renderer listener order.
- Restricts the full Spine View injection to the primary Codex page instead of
  also attaching it to the `avatar-overlay` renderer.
- Keeps a renderer burst guard and diagnostic counter as a second layer of
  protection.
- Retains the Electron bootstrap, renderer recovery, and forwarded SSH-agent
  compatibility introduced in v0.2.2.2.

## Install

Download the DMG matching your Mac, drag **SpineCodex App** to Applications,
quit Codex Desktop completely, and open SpineCodex App.

- `arm64` — Apple Silicon
- `x64` — Intel

This release is ad-hoc signed and not notarized. macOS may require right-clicking
**Open** or allowing it once in **System Settings → Privacy & Security**.
