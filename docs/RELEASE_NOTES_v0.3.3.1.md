# SpineCodex App v0.3.3.1

[中文发布说明](RELEASE_NOTES_v0.3.3.1_ZH.md)

This App-only update keeps the official `@spinejit/spine-codex@0.3.3`
baseline and adds recovery for an oversized Spine memory fragment. Codex
Desktop and SpineCodex remain separately installed external requirements.

## Compatibility

| Component | Release status |
|---|---|
| SpineCodex App | 0.3.3.1 |
| SpineCodex local minimum | 0.2.2 |
| SpineCodex recommended baseline | 0.3.3 |
| SpineCodex 0.3.3 Codex-compatible identity | 0.147.0 |
| SpineCodex remote minimum | 0.2.2 |
| Validated Codex Desktop builds | 26.810.41047, 26.818.41509 |

The complete machine-readable matrix ships as `compatibility.json`.

## Memory-fragment recovery

SpineCodex 0.3.3 accepts up to 32 KiB of memory in `spine.close` and
`spine.next`, while its context projection rejects a complete memory fragment
above 8,000 UTF-8 bytes. A memory accepted by the tool can therefore fault the
conversation on the next context plan:

```text
Fatal error: Spine context plan failed: Spine memory fragment is 9005 bytes; maximum is 8000
```

Continuing the same conversation may wrap the failure as:

```text
Fatal error: Spine durability is faulted: Spine context plan failed: Spine memory fragment is 9005 bytes; maximum is 8000
```

For these exact failures, the App now:

- reads the source rollout without modifying it;
- requires a matching `spine.close` or `spine.next` call, accepted output, and
  reported fragment byte count;
- clones the effective history and truncates only the cloned memory at a valid
  UTF-8 boundary within the observed projection budget;
- resumes a replacement thread and persists the old-to-new thread alias;
- handles `thread/status/changed` arriving before the resume response;
- leaves malformed, boundary-size, unrelated context-plan, replay, and
  durability failures untouched and fail closed.

The recovery is implemented entirely in the App main-process and Renderer
integration. It does not patch, rebuild, or replace the installed SpineCodex
CLI, and it does not edit the original session JSONL.

## Validation

The recovery was verified against the reported 9,005-byte failure: the source
rollout produced 262 history items, the accepted 8,960-byte memory was reduced
to 7,955 bytes in the cloned history, and the original rollout remained
unchanged. Regression coverage includes the first and wrapped errors, UTF-8
multibyte boundaries, accepted-output validation, non-target failures, and the
real app-server notification ordering.

## Install

Install the official SpineCodex release separately, then install the matching
SpineCodex App DMG:

```sh
npm install -g @spinejit/spine-codex@0.3.3
spine-codex --version
```

The expected CLI compatibility output is `codex-cli 0.147.0`.
