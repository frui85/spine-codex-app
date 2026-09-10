<p align="center">
  <img src="assets/app-icon.svg" width="88" alt="SpineCodex App icon">
</p>

<h1 align="center">SpineCodex App</h1>

<p align="center"><a href="README_ZH.md">简体中文</a> · <strong>English</strong></p>

<p align="center">
  <strong>The Spine, inside Codex.</strong><br>
  An interactive task tree for Codex Desktop that feels like part of the App.
</p>

<p align="center">
  <a href="https://github.com/frui85/spine-codex-app/releases/tag/v26.901.51231.1"><img alt="Release v26.901.51231.1" src="https://img.shields.io/badge/release-v26.901.51231.1-6D5DFC?style=flat-square"></a>
  <img alt="macOS 14+" src="https://img.shields.io/badge/macOS-14%2B-17171B?style=flat-square&logo=apple&logoColor=white">
  <img alt="Windows 10+" src="https://img.shields.io/badge/Windows-10%2B-17171B?style=flat-square&logo=windows&logoColor=white">
  <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-17171B?style=flat-square"></a>
  <img alt="SpineCodex 0.3.3 recommended" src="https://img.shields.io/badge/SpineCodex-0.3.3%20recommended-17171B?style=flat-square">
</p>

<p align="center">
  <a href="https://github.com/frui85/spine-codex-app/releases/download/v26.901.51231.1/SpineCodex-App-v26.901.51231.1-macos-arm64.dmg"><strong>Download for Apple Silicon</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/frui85/spine-codex-app/releases/download/v26.901.51231.1/SpineCodex-App-v26.901.51231.1-macos-x64.dmg"><strong>Download for Intel Mac</strong></a>
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

## Long trees and earlier records

The current-context projection shows its latest **20 display rows**, keeping active, Spawn and selected items visible. Expand earlier records on demand and collapse them again. This is presentation-only: it does not delete history, compact model context or mean 20 conversation turns. Existing compaction groups, icons and actions retain their meaning.

Indentation is capped at 42px and shrinks proportionally in narrow panels. Titles use at most two lines, with their full normalized label available on hover and the original detail view available on click. Deep rows show their projection level.

| Collapsed | Expanded |
|---|---|
| ![Local isolated Renderer: latest 20 rows](docs/media/ui-review-20260910/01-collapsed.png) | ![Local isolated Renderer: 80 rows expanded](docs/media/ui-review-20260910/02-expanded.png) |

These are local tests using production Renderer functions and synthetic data, not live Desktop session screenshots. The original upstream images/GIF below are historical examples; old version badges and “zero polling” do not describe every current startup mode.

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

Spine controls live directly below Codex's Model features. Settings are host-aware, so local and SSH-connected environments keep independent values. The header reports the local SpineCodex product and Codex compatibility versions; remote hosts keep independent feature state without borrowing local version claims.

![Spine feature controls embedded in Codex Model features](docs/media/spine-settings.png)

## Designed to disappear into Codex

- **Pinned and floating summaries** — the same tree mounts in either native summary surface.
- **Codex-aware language and appearance** — follows 10 App locales, light/dark colors, typography, motion tokens, and reduced-motion preference.
- **Event-driven tree data** — no task-data polling, React Fiber scan, or permanent whole-page observer. External adapter mode separately supervises Renderer targets once per second.
- **Local and remote** — launches the installed SpineCodex locally and selects `spine-codex` through Codex's native SSH transport remotely.
- **Bounded and reversible** — one latest snapshot per task, bounded persistence, no `app.asar` modification, and narrow hooks that fail closed.

The full cache limits, rendering contracts, navigation behavior, and performance design are documented in [Feature details](docs/FEATURES.md).

## Install

### 1. Install the two upstream requirements

- macOS 14 or newer, or Windows 10 build 17763 or newer
- The current [ChatGPT desktop app with Codex](https://chatgpt.com/download/)
- SpineCodex 0.2.2 or newer; 0.3.3 is the recommended and validated baseline:

```sh
npm install -g @spinejit/spine-codex@latest
spine-codex --version
```

### 2. Install SpineCodex App on macOS

Download the DMG for your Mac, drag **SpineCodex App** to Applications, quit ChatGPT completely with **Command-Q**, then open SpineCodex App.

| Mac | Download |
|---|---|
| Apple Silicon | [SpineCodex-App-v26.901.51231.1-macos-arm64.dmg](https://github.com/frui85/spine-codex-app/releases/download/v26.901.51231.1/SpineCodex-App-v26.901.51231.1-macos-arm64.dmg) |
| Intel | [SpineCodex-App-v26.901.51231.1-macos-x64.dmg](https://github.com/frui85/spine-codex-app/releases/download/v26.901.51231.1/SpineCodex-App-v26.901.51231.1-macos-x64.dmg) |

The release packages contain only this wrapper and its private Node.js runtime. **Codex Desktop and SpineCodex are not bundled, downloaded, or installed.** If either is missing, the built-in doctor reports both requirements together and leaves the system unchanged.

> The initial public build is ad-hoc signed because the project does not yet have a Developer ID certificate. If macOS blocks the first launch, right-click the app and choose **Open**, or allow it once in **System Settings → Privacy & Security**. SHA-256 files are published beside both DMGs.

### CLI baselines and the macOS menu bar

| CLI source | SpineCodex product | Codex CLI compatibility |
|---|---|---|
| [Official](https://github.com/GhabiX/SpineCodex) | 0.3.3 | 0.147.0 |
| [Supported fork](https://github.com/xiurui-pan/SpineCodex) | 0.4.1 | 0.153.4 |

Official 0.3.3 follows an older Codex baseline. Fork 0.4.1 supplements support for the newer CLI baseline; official CLI updates will continue to receive regression testing. The wrapper never automatically replaces your installed CLI. A version-pair match identifies an adaptation baseline, not binary provenance.

The native menu bar shows actual startup mode, Desktop version, CLI product/compatibility versions, and connection health. It provides mode switching, restart, and copyable adaptation information.

- **Clone (default):** preserves private-clone validation, main-process hooks, replay/memory recovery, and SSH bootstrap protection.
- **External adapter:** uses the original signed Desktop, verifies zsh PATH selection and actual adapter initialization, and supervises the Renderer through loopback CDP. Requires CLI compatibility 0.147.0 or newer. Clone-only replay recovery and SSH bootstrap patches are unavailable.
- **Auto:** prefers clone mode, falling back to the external adapter only after the failed instance stops. The actual mode and fallback reason remain visible.

Switching asks to restart Desktop and can interrupt active tasks. Preferences commit after readiness; failed switches attempt to restore the old mode. Preferences live in `~/Library/Application Support/SpineCodex App/preferences.json`. Override one launch with `--mode clone|adapter|auto`; use `--no-tray` to omit the menu bar (clone mode then returns after readiness; adapter mode keeps its supervisor running). Example: `./spine-app --mode adapter --diagnose --json`.

### Windows x64 portable build

The Windows build is currently produced locally as a portable ZIP. Extract the complete folder and run **SpineCodex App.exe**; do not move the executable away from its adjacent `runtime` and `wrapper` directories.

```sh
npm run build:windows
```

The build uses the official checksum-pinned Windows Node.js runtime and two tiny native x64 launchers compiled from this repository. It does not download or package Codex Desktop or SpineCodex. A complete Windows Actions definition is kept as `.github/workflows/windows-release.yml.disabled`; GitHub does not execute it. Windows code signing and further real-device startup validation are required before enabling that workflow or publishing a supported Windows asset.

Microsoft Store builds can ignore `NODE_OPTIONS` even when the packaged launcher does not expose a readable Electron fuse wire. On Windows, the wrapper therefore starts Electron paused on a fresh loopback-only Inspector port, loads the main-process hook in the paused CommonJS frame, resumes immediately, and closes the Inspector connection. Renderer injection proceeds only after the hook reports that both compatibility patches are ready. If Inspector injection or that handshake fails, the wrapper refuses to continue silently with an unpatched official-Codex backend.

<details>
<summary><strong>Automatic path discovery</strong></summary>

No path setup is required in the normal case.

| Target | Discovery order |
|---|---|
| Codex Desktop | macOS standard locations plus Spotlight/Launch Services; Windows standard install locations plus the stable OpenAI AppX package identity and manifest executable path |
| Local SpineCodex | Explicit override, environment, current/login-shell `PATH`, Homebrew/npm/Volta/nvm locations, and Windows npm command shims |
| Remote SpineCodex | Each SSH host's login-shell `PATH`; the local executable path is never sent to the server |

Explicit `--app` and `--spine-codex` options remain available for development and troubleshooting:

```sh
./spine-app --diagnose
./spine-app --diagnose --json
```

The JSON form reports the App version, SpineCodex product and Codex
compatibility identities, Apps protocol mode, Desktop bundle contract,
renderer checksum, and local/remote compatibility requirements.

</details>

<details>
<summary><strong>How the wrapper works</strong></summary>

```text
SpineCodex App
  ├─ launches the installed Codex Desktop app
  ├─ points local app-server startup at the installed spine-codex
  ├─ selects spine-codex for Codex's native SSH startup path
  └─ injects and recovers one event-driven renderer extension
       ├─ turn/spineTree/updated
       └─ turn/spineSpawnProgress/updated
```

Both modes share the local protocol adapter and app catalog output filter, with image generation temporarily disabled. Clone mode keeps the in-process event listeners and compatibility patches; it changes and signs only a private Desktop copy.

External mode adopts upstream's adapter/supervisor architecture, fixes PATH priority, and verifies the actual initialize response through the private adapter before readiness. The supervisor polls once per second, targets only the main Renderer, and reconnects while its owned Desktop is alive. Its temporary shell environment lasts until Desktop exits. Restart the external supervisor after upgrading wrapper scripts.

The launcher remains alive to manage the menu bar and restart transactions. Mode changes quit only the tracked Desktop PID with the matching bundle path, and do not force-kill other applications.

See [SECURITY.md](SECURITY.md) for the trust boundary and [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for bundled runtime notices.

</details>

<details>
<summary><strong>Run from source</strong></summary>

```sh
git clone https://github.com/frui85/spine-codex-app.git
cd spine-codex-app
npm run build:statusbar
./spine-app --diagnose
./spine-app
./spine-app /path/to/workspace
```

Source usage requires Node.js 22 or newer. Opening without a path launches the existing Codex interface; it does not create a task rooted at `/`. The launcher remains alive for mode switching and supervision, then cleans up when Desktop exits. Source builds of the native menu bar require Xcode Command Line Tools; releases contain the compiled helper.

</details>

<details>
<summary><strong>Build, versioning, and compatibility</strong></summary>

This release is **v26.901.51231.1**: the first three components match the target Codex Desktop version, following the official App's release convention. A later wrapper revision for the same Desktop can append a fourth component, for example `26.901.51231.1`. CLI product and compatibility versions remain separate metadata. Historical release numbers are preserved.

Pushing a matching `v*` tag starts the checked-in GitHub Actions release pipeline. The workflow validates the tag against `package.json#spineAppVersion`, runs the full checks, builds and verifies both macOS DMGs, uploads immutable workflow artifacts, and only then publishes the GitHub Release. Release creation begins as a draft so a failed upload cannot expose a partial release. Windows workflow code is present but intentionally disabled.

The clone mode historical bundle contract was validated against ChatGPT/Codex Desktop builds `26.810.41047`, `26.818.41509`, `26.825.51511`, `26.901.20858`, and `26.901.51231`. On macOS, a build with the `nodeCliInspect` fuse set to `off` or `removed` cannot be injected in place: Electron ignores `--inspect*` and `SIGUSR1`. SpineCodex App therefore prepares a private inspectable clone of the installed bundle under `~/Library/Application Support/SpineCodex App/inspectable-desktop/` (an APFS clone with only that fuse re-enabled and a hardened-runtime ad-hoc signature), launches the clone paused on a loopback-only `--inspect-brk` port, verifies the PID, and injects the main hook before Renderer startup. The original `ChatGPT.app` stays unmodified, the clone is rebuilt after every Desktop update, and `SPINE_CODEX_DISABLE_DESKTOP_CLONE=1` restores the fail-closed preflight error instead. Diagnostics scan the installed macOS `app.asar` read-only and require exactly one main-process patch target plus one shared version/CLI-selector target. Unknown or ambiguous structures fail closed. Windows Store discovery and dependency preflight have been exercised on a real Windows installation; the main-process Inspector path still requires broader real-device validation before Windows is published as a supported GitHub Release asset.

SpineCodex 0.3.3 reports product version `0.3.3` and Codex-compatible identity `0.147.0`; the App records both. OpenAI Codex `0.149.1` is not a SpineCodex validation baseline for this release. Image generation remains disabled pending a separate end-to-end generation, replay, Tree-update, and recovery gate. The machine-readable matrix is checked in as [`compatibility.json`](compatibility.json).

```sh
npm run check
npm run build:macos
npm run build:windows
```

The build scripts download pinned official Node.js runtimes, verify them against Node's SHA-256 manifest, and emit architecture-specific macOS DMGs or a Windows x64 portable ZIP. They never download SpineCodex or Codex Desktop.

</details>

## Contributing

Issues and focused pull requests are welcome. Start with [CONTRIBUTING.md](CONTRIBUTING.md), and report security-sensitive findings through [SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).

<p align="center"><sub>Independent project. Not affiliated with or endorsed by OpenAI.</sub></p>
