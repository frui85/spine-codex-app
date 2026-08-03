<p align="center">
  <img src="assets/app-icon.svg" width="88" alt="SpineCodex App icon">
</p>

<h1 align="center">SpineCodex App</h1>

<p align="center">
  <strong>The Spine, inside Codex.</strong><br>
  An interactive task tree for Codex Desktop that feels like part of the App.
</p>

<p align="center">
  <a href="https://github.com/izumedonabe/spine-codex-app/releases/tag/v0.2.1"><img alt="Release v0.2.1" src="https://img.shields.io/badge/release-v0.2.1-6D5DFC?style=flat-square"></a>
  <img alt="macOS 14+" src="https://img.shields.io/badge/macOS-14%2B-17171B?style=flat-square&logo=apple&logoColor=white">
  <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-17171B?style=flat-square"></a>
  <img alt="SpineCodex 0.2.1+" src="https://img.shields.io/badge/SpineCodex-0.2.1%2B-17171B?style=flat-square">
</p>

<p align="center">
  <a href="https://github.com/izumedonabe/spine-codex-app/releases/download/v0.2.1/SpineCodex-App-v0.2.1-macos-arm64.dmg"><strong>Download for Apple Silicon</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/izumedonabe/spine-codex-app/releases/download/v0.2.1/SpineCodex-App-v0.2.1-macos-x64.dmg"><strong>Download for Intel Mac</strong></a>
  &nbsp;·&nbsp;
  <a href="docs/FEATURES.md">Explore every feature</a>
</p>

<br>

![SpineCodex App — an interactive Spine Tree embedded in Codex Desktop](docs/media/hero.png)

<br>

SpineCodex already gives long-running Codex work a real structure: scoped tasks, closed-node memory, compaction boundaries, and concurrent Spawn branches. **SpineCodex App makes that structure visible and operable without replacing the Codex experience.**

<table>
  <tr>
    <td width="33%" valign="top">
      <h3>Trace the work</h3>
      Current tasks stay at the surface. Earlier context is grouped by real compaction boundary instead of becoming an endless transcript.
    </td>
    <td width="33%" valign="top">
      <h3>Inspect the memory</h3>
      Open any node in Codex's own right workspace sidebar to inspect its path, summary, closed memory, context growth, and event range.
    </td>
    <td width="33%" valign="top">
      <h3>Follow every agent</h3>
      Watch Spine Spawn branches live, keep task-based agent names, and jump directly into the matching child-agent history.
    </td>
  </tr>
</table>

## See it in motion

![Real Codex Desktop session showing Spine compaction groups folding with native motion](docs/media/spine-demo.gif)

<p align="center"><sub>Real Codex Desktop session · English UI · dark appearance · no simulated product mockup</sub></p>

## Details, where details belong

Click a task and its full context opens as a normal page in Codex's existing right sidebar—not as a floating userscript card and not as a second sidebar.

![A Spine node detail page sharing Codex's native right sidebar with the task tree](docs/media/spine-detail.png)

## Spawn branches stay connected

Live Spawn progress is reconciled with the final closed Spine nodes. Child agents inherit the task summary as their display name, and **Open subagent** takes you to the corresponding native Codex agent history. The structured Spawn intent is saved before progress begins, so task names survive an interrupted parent turn or an App restart.

![Codex's native Subagents page alongside the embedded Spine Tree](docs/media/spine-subagents.png)

## Configured like a native feature

Spine controls live directly below Codex's Model features. Settings are host-aware, so local and SSH-connected environments keep independent values.

![Spine feature controls embedded in Codex Model features](docs/media/spine-settings.png)

## Designed to disappear into Codex

- **Pinned and floating summaries** — the same tree mounts in either native summary surface.
- **Codex-aware language and appearance** — follows 10 App locales, light/dark colors, typography, motion tokens, and reduced-motion preference.
- **Event-driven by default** — no watchdog, polling loop, React Fiber scan, or permanent whole-page observer.
- **Local and remote** — launches the installed SpineCodex locally and selects `spine-codex` through Codex's native SSH transport remotely.
- **Bounded and reversible** — one latest snapshot per task, bounded persistence, no `app.asar` modification, and narrow hooks that fail closed.

The full cache limits, rendering contracts, navigation behavior, and performance design are documented in [Feature details](docs/FEATURES.md).

## Install

### 1. Install the two upstream requirements

- macOS 14 or newer
- The current [ChatGPT desktop app with Codex](https://chatgpt.com/download/)
- SpineCodex 0.2.1 or newer:

```sh
npm install -g @spinejit/spine-codex@latest
spine-codex --version
```

### 2. Install SpineCodex App

Download the DMG for your Mac, drag **SpineCodex App** to Applications, quit ChatGPT completely with **Command-Q**, then open SpineCodex App.

| Mac | Download |
|---|---|
| Apple Silicon | [SpineCodex-App-v0.2.1-macos-arm64.dmg](https://github.com/izumedonabe/spine-codex-app/releases/download/v0.2.1/SpineCodex-App-v0.2.1-macos-arm64.dmg) |
| Intel | [SpineCodex-App-v0.2.1-macos-x64.dmg](https://github.com/izumedonabe/spine-codex-app/releases/download/v0.2.1/SpineCodex-App-v0.2.1-macos-x64.dmg) |

The DMGs contain only this wrapper and its private Node.js runtime. **Codex Desktop and SpineCodex are not bundled, downloaded, or installed.** If either is missing, the built-in doctor reports both requirements together and leaves the system unchanged.

> The initial public build is ad-hoc signed because the project does not yet have a Developer ID certificate. If macOS blocks the first launch, right-click the app and choose **Open**, or allow it once in **System Settings → Privacy & Security**. SHA-256 files are published beside both DMGs.

<details>
<summary><strong>Automatic path discovery</strong></summary>

No path setup is required in the normal case.

| Target | Discovery order |
|---|---|
| Codex Desktop | Standard `/Applications` and `~/Applications` locations, then Spotlight/Launch Services using `com.openai.codex` |
| Local SpineCodex | Explicit override, environment, current/login-shell `PATH`, Homebrew, npm, Volta, and installed nvm versions |
| Remote SpineCodex | Each SSH host's login-shell `PATH`; the local executable path is never sent to the server |

Explicit `--app` and `--spine-codex` options remain available for development and troubleshooting:

```sh
./spine-app --diagnose
```

</details>

<details>
<summary><strong>How the wrapper works</strong></summary>

```text
SpineCodex App
  ├─ launches the installed Codex Desktop app
  ├─ points local app-server startup at the installed spine-codex
  ├─ selects spine-codex for Codex's native SSH startup path
  └─ injects one event-driven renderer extension
       ├─ turn/spineTree/updated
       └─ turn/spineSpawnProgress/updated
```

The launcher does not modify `app.asar`, replace the Codex React tree, or patch the application on disk. Renderer integration uses a Shadow DOM surface and narrow structural hooks; version-sensitive main-process hooks fail closed when an unknown Codex bundle no longer matches.

See [SECURITY.md](SECURITY.md) for the trust boundary and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled runtime notices.

</details>

<details>
<summary><strong>Run from source</strong></summary>

```sh
git clone https://github.com/izumedonabe/spine-codex-app.git
cd spine-codex-app
./spine-app --diagnose
./spine-app
./spine-app /path/to/workspace
```

Source usage requires Node.js 22 or newer. Opening without a path launches the existing Codex interface; it does not create a task rooted at `/`. The launcher exits after registering the renderer, while Codex Desktop keeps running.

</details>

<details>
<summary><strong>Build, versioning, and compatibility</strong></summary>

Release versions track the minimum supported SpineCodex release. This release is **v0.2.1** and requires SpineCodex 0.2.1 or newer. Version tracking does not mean SpineCodex is redistributed here.

The initial release was tested with ChatGPT/Codex Desktop build `26.727.40816`. Codex internals can change, so compatibility-sensitive hooks match narrow structural markers and fail closed instead of patching an unknown bundle.

```sh
npm run check
npm run build:macos
```

The macOS build downloads pinned official Node.js arm64/x64 runtimes, verifies them against Node's SHA-256 manifest, and emits architecture-specific DMGs. It never downloads SpineCodex or Codex Desktop.

</details>

## Contributing

Issues and focused pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and report security-sensitive findings through [SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).

<p align="center"><sub>Independent project. Not affiliated with or endorsed by OpenAI.</sub></p>
