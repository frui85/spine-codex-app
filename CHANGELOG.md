# Changelog

## Unreleased

- Persists structured Spine Spawn task names before live progress, preserving native child-agent list and header names across interrupted parent turns and App restarts.

## v0.2.1 — 2026-07-31

First public release, tracking SpineCodex v0.2.1.

- Launches the installed Codex Desktop app with an installed SpineCodex backend.
- Adds an embedded, interactive, localized Spine Tree to native summary surfaces.
- Adds Spine feature controls and Spawn child-agent navigation.
- Uses SpineCodex for local and connected SSH-host app servers.
- Ships standalone macOS arm64 and x64 DMGs containing only this wrapper and its Node runtime.
- Auto-discovers Codex Desktop and SpineCodex; neither dependency is bundled or installed.
- Follows Codex's runtime `localeOverride` setting across repeated in-app language changes.
