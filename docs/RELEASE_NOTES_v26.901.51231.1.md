# SpineCodex App v26.901.51231.1

[中文发布说明](RELEASE_NOTES_v26.901.51231.1_ZH.md)

This App-only UI revision targets Codex Desktop **26.901.51231**. It fixes deeply nested task titles being squeezed into vertical text and makes long histories easier to browse.

## Tree layout and history

- Visual indentation is capped at 42px or 18% of available width. Projection depth and parent/child IDs are unchanged; deep rows display their level.
- Titles occupy at most two lines. Their complete normalized text is available on hover, and clicking tasks still opens the original detail view. Metadata moves below the title instead of consuming its width.
- The current context shows the latest 20 projected rows by default. Earlier records can be expanded and collapsed; active/live, Spawn and selected rows stay visible, so the total can exceed 20.
- This window is presentation-only. It does not delete history, compact model context, or count conversation turns. Earlier compaction groups and previous-branch controls retain their meaning.
- The old first-300-row cutoff is removed so the active tip remains reachable. Explicitly expanded very large trees can contain more rows.
- Original upstream node/Spawn icon SVGs, status mappings, and existing actions are preserved.

## Compatibility

| Component | Version |
|---|---|
| Desktop target | 26.901.51231 |
| SpineCodex recommended baseline | 0.3.3 |
| Official SpineCodex / Codex CLI | 0.3.3 / 0.147.0 |
| Supplementary xiurui-pan fork / Codex CLI | 0.4.1 / 0.153.4 |

Clone remains the default in this fork; external adapter and auto fallback remain available. This revision does not expand the Desktop compatibility matrix or change the underlying CLI. Image generation remains disabled. Windows releases remain disabled.

## Validation and screenshots

Local browser checks use production Renderer projection, row rendering, icons and folding handlers with synthetic 80-level data. Expanding produces 80 records plus the control; collapsing returns to 20 records plus the control. Tests also cover 350 levels, active-tip retention, per-thread isolation, and 180–480px requested panel widths without horizontal overflow.

![Local isolated Renderer test: collapsed history](https://raw.githubusercontent.com/frui85/spine-codex-app/v26.901.51231.1/docs/media/ui-review-20260910/01-collapsed.png)

The screenshot is a local synthetic-data test, not a live user conversation. The complete source checks and local macOS package validation run before release; GitHub Actions builds and verifies both arm64 and Intel DMGs. Intel runtime behavior still requires an Intel Mac regression.

Local compiled arm64 package verification on 2026-09-10 passed: clone startup reached `Spine Tree ready` in 17.3s, external adapter in 9.6s, both exited normally after the test. The packaged Renderer matched the checked source byte-for-byte. DMG integrity, SHA-256, and strict App signing verification passed.
