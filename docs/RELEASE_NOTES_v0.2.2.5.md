# SpineCodex App v0.2.2.5

[中文修复说明](RELEASE_NOTES_v0.2.2.5_ZH.md)

This wrapper-only revision continues to require an externally installed
SpineCodex 0.2.2 or newer.

## Fixed

- Restores startup compatibility with ChatGPT Desktop `26.810.41047`.
- Recognizes the new grouped SSH app-server bootstrap containing secure
  directory creation, forwarded SSH-agent preparation, and log initialization.
- Replaces the complete grouped cleanup expression before injecting the
  SpineCodex bootstrap, preventing an unmatched shell subshell.
- Keeps unknown Electron bundle structures fail-closed instead of launching an
  unverified backend path.

## Verification

- The compatibility patch was exercised against the extracted
  `26.810.41047` main and shared bundles.
- The generated SSH bootstrap passes `/bin/sh -n` validation.
- The complete test suite and macOS arm64 release build pass locally.
