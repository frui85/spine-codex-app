# SpineCodex App

A lightweight macOS launcher that runs the installed Codex Desktop app with the installed [SpineCodex](https://github.com/GhabiX/SpineCodex) backend and adds an embedded, interactive Spine Tree to the native Codex interface.

SpineCodex App is independently maintained. It is not an OpenAI product and it does not modify `app.asar` or replace either dependency.

## Requirements

- macOS 14 or newer
- The current [ChatGPT desktop app with Codex](https://chatgpt.com/download/)
- `spine-codex` 0.2.1 or newer, installed separately:

```sh
npm install -g @spinejit/spine-codex@latest
spine-codex --version
```

The release DMGs contain only this wrapper and the Node.js runtime needed to execute it. **Codex Desktop and SpineCodex are not bundled, downloaded, or installed.**

## Install from a DMG

1. Download the `arm64` DMG for Apple Silicon or the `x64` DMG for an Intel Mac from the GitHub Release.
2. Drag **SpineCodex App** to Applications.
3. Install Codex Desktop and SpineCodex if the first-run check says either is missing.
4. Quit ChatGPT completely with **Command-Q**.
5. Open **SpineCodex App**.

The initial public build is ad-hoc signed because the project does not yet have a Developer ID certificate. If macOS blocks the first launch, right-click the app and choose **Open**, or allow it once in **System Settings → Privacy & Security**. The release page publishes SHA-256 checksums for both DMGs.

Opening the App without a path launches the existing Codex interface and injects Spine View; it does not create a task rooted at `/`. The source/CLI entry accepts an optional workspace path when a new task should be opened there.

## Automatic discovery

No path setup is required in the normal case.

- **Codex Desktop:** checks the standard `/Applications` and `~/Applications` locations, then Spotlight/Launch Services using the official `com.openai.codex` bundle identifier.
- **SpineCodex:** checks an explicit development override, the current and login-shell `PATH`, Homebrew/npm/Volta user locations, and installed nvm versions.
- **SSH hosts:** Codex's native SSH transport resolves `spine-codex` from each remote login shell. The local path is never sent to the server.

Explicit `--app` and `--spine-codex` options remain available for development and troubleshooting.

If both dependencies are absent, first run reports both missing requirements together and links to their installers. It exits without changing the system. If Node.js is absent, the DMG still runs because its private Node runtime is self-contained; source checkouts require Node.js 22 or newer.

## What it adds

- Native pinned and floating-summary Spine Tree surfaces
- Clickable node details in Codex's existing right workspace sidebar
- Root-epoch/compaction history with stable folding behavior
- Live Spine Spawn state, child-agent navigation, and task-based child names
- Host-aware Spine feature switches for local and SSH sessions
- Automatic localization for ten Codex UI locales
- Codex-native disclosure, row, chevron, and reduced-motion behavior
- Lightweight event-driven rendering with no watchdog, renderer polling, Fiber scan, or permanent whole-page observer
- Local and remote SpineCodex app-server selection with a truthful minimum-version check

The complete behavior and performance contracts are documented in [Feature details](docs/FEATURES.md). Security boundaries are described in [SECURITY.md](SECURITY.md).

## Source usage

```sh
git clone https://github.com/izumedonabe/spine-codex-app.git
cd spine-codex-app
./spine-app --diagnose
./spine-app
./spine-app /path/to/workspace
```

Source usage requires Node.js 22 or newer. The launcher exits after it registers the renderer; Codex Desktop continues running. A full Codex App restart must be launched through SpineCodex App again.

## Versioning

Release versions track the minimum supported SpineCodex release. This release is **v0.2.1** and requires SpineCodex 0.2.1 or newer. Tracking the version does not mean that SpineCodex is redistributed in this project.

The initial release was tested with ChatGPT/Codex Desktop build `26.727.40816`. Codex internals can change; version-sensitive hooks match narrow structural markers and fail closed instead of patching an unknown bundle.

## Build and verify

```sh
npm run check
npm run build:macos
```

The build script downloads pinned official Node.js arm64/x64 runtimes, verifies them against Node's published SHA-256 manifest, creates ad-hoc-signed App bundles, and emits architecture-specific DMGs plus checksum files under `dist/`. It never downloads SpineCodex or Codex Desktop.

## License

Apache-2.0. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
