# SpineCodex App v0.3.3.0

[中文发布说明](RELEASE_NOTES_v0.3.3.0_ZH.md)

This release adapts SpineCodex App to `@spinejit/spine-codex@0.3.3` and adds
App-level recovery for an inherited-subagent durability mismatch. Codex Desktop
and SpineCodex remain separately installed external requirements.

## Compatibility

| Component | Release status |
|---|---|
| SpineCodex App | 0.3.3.0 |
| SpineCodex local minimum | 0.2.2 |
| SpineCodex recommended baseline | 0.3.3 |
| SpineCodex 0.3.3 Codex-compatible identity | 0.147.0 |
| SpineCodex remote minimum | 0.2.2 |
| Validated Codex Desktop builds | 26.810.41047, 26.818.41509 |

The complete machine-readable matrix ships as `compatibility.json`.

## Replay recovery

Some inherited subagent conversations contain native Codex history before their
first Spine durability record. SpineCodex may reject those conversations with:

```text
Fatal error: Spine durability is faulted: Spine replay failed: sampling commit does not match its sampling-started record
```

For this exact failure, the App now:

- reconstructs the effective native history from the original rollout without
  modifying the source session;
- requires a valid inherited parent, native compaction history, epoch-zero
  Spine boundary, and parent Spine record;
- starts a replacement thread with the reconstructed history and persists the
  old-to-new thread alias for later navigation;
- handles `thread/status/changed` arriving before the resume response;
- leaves every other replay or durability failure untouched and fail closed.

The recovery is implemented in the App main-process and Renderer integration.
It does not patch or replace the installed SpineCodex CLI.

## Protocol contracts

The Tree and Spawn notification schemas were generated from the official
SpineCodex 0.3.3 app-server and pinned as integrity-checked fixtures. Their
contract is unchanged from the previous integration.

## Install

Install SpineCodex separately, then install the matching SpineCodex App DMG:

```sh
npm install -g @spinejit/spine-codex@0.3.3
spine-codex --version
```

The expected CLI compatibility output is `codex-cli 0.147.0`.
