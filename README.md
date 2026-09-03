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
  <a href="https://github.com/frui85/spine-codex-app/releases/tag/v0.3.3.4"><img alt="Release v0.3.3.4" src="https://img.shields.io/badge/release-v0.3.3.4-6D5DFC?style=flat-square"></a>
  <img alt="macOS 14+" src="https://img.shields.io/badge/macOS-14%2B-17171B?style=flat-square&logo=apple&logoColor=white">
  <img alt="Windows 10+" src="https://img.shields.io/badge/Windows-10%2B-17171B?style=flat-square&logo=windows&logoColor=white">
  <a href="LICENSE"><img alt="Apache 2.0" src="https://img.shields.io/badge/license-Apache--2.0-17171B?style=flat-square"></a>
  <img alt="SpineCodex 0.3.3 recommended" src="https://img.shields.io/badge/SpineCodex-0.3.3%20recommended-17171B?style=flat-square">
</p>

<p align="center">
  <a href="https://github.com/frui85/spine-codex-app/releases/download/v0.3.3.4/SpineCodex-App-v0.3.3.4-macos-arm64.dmg"><strong>Download for Apple Silicon</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/frui85/spine-codex-app/releases/download/v0.3.3.4/SpineCodex-App-v0.3.3.4-macos-x64.dmg"><strong>Download for Intel Mac</strong></a>
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

Spine controls live directly below Codex's Model features. Settings are host-aware, so local and SSH-connected environments keep independent values. The header reports the local SpineCodex product and Codex compatibility versions; remote hosts keep independent feature state without borrowing local version claims.

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
| Apple Silicon | [SpineCodex-App-v0.3.3.4-macos-arm64.dmg](https://github.com/frui85/spine-codex-app/releases/download/v0.3.3.4/SpineCodex-App-v0.3.3.4-macos-arm64.dmg) |
| Intel | [SpineCodex-App-v0.3.3.4-macos-x64.dmg](https://github.com/frui85/spine-codex-app/releases/download/v0.3.3.4/SpineCodex-App-v0.3.3.4-macos-x64.dmg) |

The release packages contain only this wrapper and its private Node.js runtime. **Codex Desktop and SpineCodex are not bundled, downloaded, or installed.** If either is missing, the built-in doctor reports both requirements together and leaves the system unchanged.

> The initial public build is ad-hoc signed because the project does not yet have a Developer ID certificate. If macOS blocks the first launch, right-click the app and choose **Open**, or allow it once in **System Settings → Privacy & Security**. SHA-256 files are published beside both DMGs.

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

The launcher does not modify `app.asar`, replace the Codex React tree, or patch the application on disk. Renderer integration uses a Shadow DOM surface and narrow structural hooks. Local startup uses a dedicated absolute path to the wrapper's private shim, so a Desktop login-shell environment refresh cannot bypass its output filter. Remote SSH keeps the portable command name `spine-codex`, resolved independently by each host's login shell. Remote bootstrap is serialized and idempotent: it reuses a healthy SpineCodex server, replaces only a same-user stale or official-Codex socket owner, and does not start the proxy until the Unix socket is demonstrably ready. A one-time launcher/main-process readiness handshake verifies the local selector, version check, and SSH bootstrap structures before startup is reported as successful; unknown bundles fail closed.

The verified main hook also keeps two narrow Electron lifecycle listeners. It
SHA-256 verifies the packaged `spine-view.js` at startup. On each main-window
`did-finish-load`—including a reload after an Electron renderer crash—it reads
the same absolute resource path again and executes the current renderer only in
the exact `app://-/index.html` surface. This prevents a long-running main
process from reviving an older in-memory renderer after the installed wrapper
has been updated. There is no timer, polling watchdog, or extra resident
process. The renderer's own revision guard makes the initial CDP injection and
any recovery injection idempotent.

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

Source usage requires Node.js 22 or newer. Opening without a path launches the existing Codex interface; it does not create a task rooted at `/`. The launcher exits after verifying the main hook and initial renderer injection; Codex Desktop keeps running, and the in-process lifecycle listeners recover Spine View if Electron replaces its renderer.

</details>

<details>
<summary><strong>Build, versioning, and compatibility</strong></summary>

This release is **v0.3.3.4**: the first three components identify the recommended SpineCodex validation baseline, and the fourth identifies an App-only revision. The compatibility floor remains SpineCodex 0.2.2. Product version, Codex-compatible identity, and minimum support are separate fields; version tracking does not mean SpineCodex is redistributed here.

Pushing a matching `v*` tag starts the checked-in GitHub Actions release pipeline. The workflow validates the tag against `package.json#spineAppVersion`, runs the full checks, builds and verifies both macOS DMGs, uploads immutable workflow artifacts, and only then publishes the GitHub Release. Release creation begins as a draft so a failed upload cannot expose a partial release. Windows workflow code is present but intentionally disabled.

The current bundle contract is validated against ChatGPT/Codex Desktop builds `26.810.41047`, `26.818.41509`, `26.825.51511`, and `26.901.20858`. When macOS disables the `NODE_OPTIONS` and Node CLI Inspector fuses, startup enables a loopback-only Inspector through the launched Desktop PID, pauses it through CDP, and verifies the PID before main-process injection. Diagnostics scan the installed macOS `app.asar` read-only and require exactly one main-process patch target plus one shared version/CLI-selector target. Unknown or ambiguous structures fail closed. Windows Store discovery and dependency preflight have been exercised on a real Windows installation; the main-process Inspector path still requires broader real-device validation before Windows is published as a supported GitHub Release asset.

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
