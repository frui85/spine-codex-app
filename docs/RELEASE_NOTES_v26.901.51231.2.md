# SpineCodex App v26.901.51231.2

[中文发布说明](RELEASE_NOTES_v26.901.51231.2_ZH.md)

This macOS menu update targets Codex Desktop **26.901.51231**.

## Menu language

- The menu defaults to English. **Language / 语言** offers **English**, **简体中文**, and **Follow System** with a checkmark for the current selection.
- Switching updates menu/status text, the adaptation window, confirmation dialogs, accessibility labels, and copied information immediately, without restarting Desktop.
- Follow System matches the primary macOS language. Chinese region/script variants use Simplified Chinese; unsupported languages fall back to English.
- The helper remembers language separately from startup mode in the macOS defaults domain `io.github.frui85.spine-status.preferences`, under `menuLanguage`.
- Raw diagnostic errors retain their original text. The menu-bar icon now uses the official Spine mark.

## Compatibility

| Component | Version |
|---|---|
| Desktop target | 26.901.51231 |
| SpineCodex recommended baseline | 0.3.3 |
| Official SpineCodex / Codex CLI | 0.3.3 / 0.147.0 |
| Supplementary xiurui-pan fork / Codex CLI | 0.4.1 / 0.153.4 |

Clone mode remains the default. External adapter and automatic fallback are available. This revision keeps the existing CLI and Desktop compatibility baselines.

## Validation

- Full source checks: 77 tests plus Renderer and SSH regression checks.
- Native Swift checks cover language/region resolution, unsupported-language fallback, saved preferences, system-language refresh, and translating an existing status snapshot.
- Local native preview verified English and Chinese menus/status windows, the language checkmark, Follow System on a Chinese macOS system, and the English restart confirmation.
- Release builds provide Apple Silicon and Intel DMGs with SHA-256 checksums. Intel execution has not been tested on a physical Intel Mac.
- Local Apple Silicon and Intel builds passed strict App signature, DMG integrity, SHA-256, bundle-version and packaged-source checks. The packaged Apple Silicon launcher passed compatibility diagnosis.
