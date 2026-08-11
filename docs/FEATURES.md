# Feature details

> [简体中文](FEATURES_ZH.md) · **English**

This document records the renderer, SSH, cache, interaction, and performance behavior behind SpineCodex App v0.2.2.4. For installation and release boundaries, see the repository [README](../README.md).

This wrapper launches Codex Desktop with your existing `spine-codex` binary and
adds a small Spine Tree section to Codex's native summary panel. It does not
patch `app.asar`, install Codex++, rebuild SpineCodex, or leave a watchdog
process running.

As a temporary workaround for the current `image_gen.imagegen` incompatibility,
the App backend starts the existing SpineCodex binary with
`--disable image_generation`. No provider, App installation, conversation
database, or SpineCodex installation is modified.

Requirements: macOS 14+ or Windows 10 build 17763+, Node.js 22 or newer,
Codex Desktop, and `spine-codex` in `PATH`.

```sh
node spine-app.mjs --diagnose
node spine-app.mjs /path/to/workspace
```

Quit Codex Desktop completely before launching. The wrapper uses a random
loopback-only CDP port, validates the renderer WebSocket, registers the
renderer for the initial target, injects the section, and then exits. The
verified Electron main hook independently keeps narrow `web-contents-created`
and `did-finish-load` listeners. It SHA-256 verifies `spine-view.js` and then
re-reads the same absolute resource path for every completed main-surface
load. It executes the current source only in the exact `app://-/index.html`
surface, so a renderer crash, reload, or BrowserWindow replacement cannot
revive an obsolete in-memory revision and does not require a launcher
watchdog. A full App process restart still needs to be launched through the
wrapper again.

On Windows, the portable package resolves the stable
`OpenAI.ChatGPT-Desktop_2p2nqsd0c76g0` package family and its AppX manifest to
the installed Electron executable without depending on the localized Start
menu display name. A native GUI
launcher starts that executable directly so the scoped `CODEX_CLI_PATH`,
`NODE_OPTIONS`, and loopback CDP arguments reach the new process. A second
native executable adapts Codex's backend launch to an externally installed npm
`spine-codex.cmd`. Both executables are small repository-built shims; neither
contains SpineCodex. The Windows package must stay together because its private
Node runtime and wrapper files are resolved relative to the launcher.

The AppX executable can be a packaged launcher rather than the Electron binary
that carries the fuse wire, and current Store builds can ignore `NODE_OPTIONS`.
Windows therefore uses a separate pre-entry path: the launcher supplies a fresh
loopback-only `--inspect-brk` port, loads the main hook in the paused CommonJS
frame through the Node Inspector protocol, resumes the process, and immediately
closes that connection. The renderer is still injected only after the hook
writes a verified `ready` handshake for both required bundle structures. A
known-disabled Node CLI Inspector fuse is a hard preflight failure; an unreadable
packaged-launcher fuse is resolved authoritatively by the runtime injection.

## Remote SSH hosts

For Codex App SSH connections, the wrapper makes the App probe and launch the
remote command **`spine-codex`** instead of **`codex`**. The same command name
is used consistently for remote discovery, `--version`, app-server startup,
app-server proxying, and cleanup. Nothing is written to `~/.ssh/config`, and no
local absolute path is sent to the server: the remote login shell resolves its
own `spine-codex` from `PATH`.

`CODEX_CLI_PATH` itself remains the portable command name `spine-codex` for
remote SSH. Locally, the verified Electron hook gives the Desktop's local CLI
selector a separate `SPINE_CODEX_LOCAL_CLI_PATH` absolute path to the wrapper's
private shim. This remains deterministic even after Desktop refreshes `PATH`
from a login shell. The shim then invokes the discovered SpineCodex binary
through the packaged Node runtime, keeping the app-server output filter in the
local process chain. The remote selector is unchanged and never receives the
local absolute path.

Install SpineCodex `0.2.2` or newer on every remote host and make sure this
works in a non-interactive login shell:

```sh
ssh <host> 'command -v spine-codex && spine-codex --version'
```

Codex Desktop currently treats CLI `0.141.0` as its upstream minimum. A tiny
Electron-main preload extends that compatibility check to SpineCodex `0.2.2`
or newer while preserving the App's original acceptance rules. It identifies
the `src-*` version bundle by the stable unsupported-version error prefix and
comparator structure—not by generated export names such as `wc` or `mc`.

The same preload identifies the local CLI selector by its stable missing-binary
error and selector structure. It patches only the local selector in the shared
`src-*` bundle; unknown structures fail closed before Desktop startup is
reported ready.

The preload also identifies the SSH bootstrap by its fixed
`desktop-ssh-websocket-v0.sock` marker and replaces only that bootstrap's
lifecycle segment. Codex normally kills a stale server only when its executable
name matches the newly selected CLI; that permits a prior official `codex`
server to survive a switch to `spine-codex` and be silently reused.

The replacement is an idempotent, per-user state machine. An atomic lock under
the remote `app-server-control` directory serializes concurrent reconnects. A
real Unix-socket connection probe plus `/proc` ancestry identifies a healthy
SpineCodex server, which is reused without interruption. A stale socket or a
healthy server whose process ancestry is not SpineCodex is replaced. `fuser`
PIDs are checked against the current login UID before either TERM or KILL is
sent, even when the SSH account has elevated privileges. The fallback combines
`pgrep -U "$(id -u)"` with a line-anchored executable pattern, so shells merely
containing the payload text cannot match. Ordinary Codex CLI sessions, explicit
listen addresses, and other users' processes remain outside the target set.

After launch, bootstrap keeps the process PID and requires two consecutive
successful socket connections before returning success to Codex Desktop. A
premature process exit or readiness timeout returns the remote app-server log
instead of allowing the proxy to fail later with an opaque `socket hang up`.

The preload runs only in Electron's browser main thread. Main and version
chunks can load in either order, so both targets are recognized independently
by content; worker, renderer, and utility processes remain untouched. Once
both patches are verified, the loader hook is removed and a one-time status
handshake lets the launcher continue. Its renderer-recovery event listeners
remain, but perform work only when the main `app://-/index.html` surface
finishes loading; they do not poll. Unknown structures, a missing renderer
recovery registration, or a renderer hash mismatch fail closed with an
explicit startup error. No `app.asar` file or App signature is modified.

SpineCodex's `--version` output is parsed honestly for the compatibility gate.
The native connection card can still show an upstream core/app-server version
such as `0.144.6`, because that value comes from the connected app-server's
initialize handshake rather than from the CLI probe. It does not mean the
remote executable was official Codex; the actual SSH command and process
identity are the authoritative backend check.

If a remote host does not contain `spine-codex`, the App's native missing-CLI
screen still calls its official Codex installer. Do not use that installer for
this wrapper; install SpineCodex on the remote host and reconnect. Because the
SSH command selection and minimum-version check live in the Electron main
process, this feature requires a complete App quit and a fresh launch through
`spine-app.mjs`; renderer hot injection alone cannot activate it.

Spine Tree is the first section in Codex's summary card. At narrower window
widths it follows Codex's own responsive behavior: click the native **Toggle
summary** button in the top-right toolbar to show the card. When the workspace
sidebar occupies the right edge, Codex changes that card from a pinned panel to
a floating Radix popover. The wrapper recognizes both native surfaces. It
prefers Codex's structured summary attributes, supports both legacy
marker-owned content and newer marker siblings, and falls back to a bounded
overlap/section-layout probe around the native summary marker. It moves the
same Spine Tree instance between them before paint. It does not duplicate the
tree, depend on translated button labels or generated class names, or assume
that a 300 px floating card must begin in the right half of a narrow window. A top-toolbar layout click arms a
bounded three-second observer only while Codex creates or transitions that
floating surface; it disconnects as soon as the tree mounts and is never a
permanent whole-page observer. Click the Spine Tree heading to collapse or
expand just that section.

## Language

Spine View reads Codex's structured `localeOverride` setting through the native
renderer bridge. This is the same value changed by **Settings → General →
Language** and is the runtime source of truth; Chromium's `navigator.language`
and the frequently stale `html[lang]` attribute are not treated as an explicit
Codex language selection. When Codex is set to automatic language detection,
`navigator.language` is used, with `html[lang]` retained only as an older-build
fallback.
Changing the App language immediately re-renders the tree, tooltips, node and
Spawn detail, duration and token formatting, accessibility labels, and the
Spine settings section. Snapshot caches contain only structured Spine data, so
translated UI text is never persisted into a conversation.

The bundled catalog includes English, Simplified Chinese, Traditional Chinese,
Japanese, Korean, German, French, Spanish, Brazilian Portuguese, and Russian.
Regional variants resolve to their language catalog (`pt-PT` currently uses
the Portuguese catalog); other Codex locales fall back to English. Locale
changes made in Codex settings are detected from the structured completion of
Codex's own settings request and followed by one exact `localeOverride` read.
The standard `languagechange` event and one attribute observer on
`document.documentElement` remain compatibility fallbacks for automatic mode;
there is no language poll or page-wide observer.
All quantities, compact token counts, clock times, durations, and plural forms
use the matching `Intl` locale.

## Motion

Spine controls reuse the motion constants shipped by Codex instead of defining
a separate animation style. Summary and nested-tree disclosure uses Codex's
native 300 ms enter curve (`--transition-duration-relaxed` with
`--cubic-enter`), including coordinated height, opacity, spacing, and row
position changes. Disclosure chevrons use the App's default 150 ms transition,
while clickable rows and detail actions use the same 150 ms press feedback and
`0.98` active scale found in Codex controls. Rapid repeated clicks cancel and
replace the previous projection animation without leaving fixed heights or
ghost rows. When `prefers-reduced-motion: reduce` is active, disclosure and
press animation is disabled while all state changes remain immediate.

Root Epochs are context-compaction boundaries, not task levels, so the current
Root Epoch is hidden just as it is in the compact CLI renderer. Current tasks
appear directly in the tree. After one or more native context compactions, all
older epochs are condensed into one quiet **Earlier context · N compactions**
row and can be inspected on demand. Inside that row, each compaction boundary
is a separate, independently collapsible **Before compaction N** group. The
historical tasks stay attached to the compaction that preceded them without
adding a prominent numbered “Context epoch 1…N” hierarchy to the main tree.

Every task row is interactive. Click it (or focus it and press Enter/Space) to
open Codex's full-height workspace sidebar—the same pane used by Terminal,
Browser, Files, Review, and Side tasks. The detail appears as a native-style
`Spine · <node>` tab in the same native tab row. Existing Terminal, Browser,
Side task, and other tabs stay in that one row instead of being covered or
pushed into a second page group. Selecting a native tab temporarily hides the
Spine detail without discarding it; selecting the Spine tab returns to the
same node. The summary card itself is never hidden,
replaced, or reparented by the wrapper. Codex may temporarily remove the
summary card from the layout while the workspace sidebar is open, which is its
normal responsive behavior. Close the Spine tab or press Escape to restore the
previous workspace-sidebar content; when the wrapper opened the pane on the
user's behalf, it also closes the pane and returns to the summary.

The wrapper selects only Codex's right-side workspace tab controller, so an
open bottom Terminal panel cannot capture the Spine detail by accident. The
detail overlays the right workspace pane without mutating the official summary
or native panel DOM; closing it therefore requires no DOM restoration pass.
During a conversation switch, a retiring right pane can remain in the DOM for
a few animation frames while already sitting partly outside the viewport. The
wrapper waits until the official right-panel shell has its full independent
width, is opaque, lies inside the viewport, and is stable across two frames
before mounting a new detail. If Codex leaves a narrow, translucent preview
parked partly outside the viewport, the wrapper first confirms that geometry is
stable across several frames and then reopens the pane through Codex's own
toolbar control. A bounded retry handles a dropped transition without asking
for a second node click. This prevents a new conversation's detail from being
painted over the summary card as a faint, clipped duplicate.

Opening a detail does not add a persistent selection background to its summary
row. Running and selected state remain visible through the status icon,
typography, and disclosure affordance; only hover and keyboard focus use a
temporary surface highlight.

The detail shows the node's status, context location, branch path, task summary,
closing memory, event range, and the approximate input-token growth since that
node opened when SpineCodex can measure it. It also provides copy actions for
the node ID and closing memory. Live Spawn task rows expose their child-thread
and agent-path metadata in the same workspace sidebar. The wrapper immediately
renames each native Codex subagent through `thread/name/set`, using the same
task summary shown in Spine Tree instead of Codex's generated
`Spawn call… <ordinal>` identifier. **Open subagent** uses Codex's own summary
panel button to switch to the exact child-agent interface; it does not construct
or guess an internal route. Running rows are recognized without requiring the
completion-only `<time>` element, so opening a child while it is still starting
or working no longer stops at Codex's aggregate Subagents page. The one-shot
navigation waits for the exact structured child row for at most five seconds;
on failure it returns to the parent thread instead of leaving the aggregate
page open. Discovery is locale-independent: the wrapper finds
the native group through its structured `data-slot` contract and identifies a
child from the alphanumeric transaction fragment derived from `callId` plus its
numeric ordinal. Chinese or English labels are never used as navigation keys.
The renderer also consumes the structured `rawResponseItem/completed` event for
the exact `spine.spawn` function call. At that point it synchronously persists
the parent thread ID, call ID, ordinal, and task summary—before it depends on
live Spawn progress or a settled tree receipt. Prompts and child output are not
stored. This bounded, 30-day cache preserves native child-agent names when the
parent turn is interrupted or the App restarts; later progress enriches the
same record with child-thread and agent-path metadata.
The same structured identity also maps Codex's independently generated
`Spawn call… <ordinal>` child-detail heading back to the Spine task summary.
Both the native list row and the child-detail header therefore show names such
as **Calculate and verify the first 40 Fibonacci terms**. While Codex's native
Subagents overview is visible, a MutationObserver is attached only to its
structured `thread-summary-panel-item-group` content root. This restores task
summaries in the same mutation checkpoint if React replaces or rerenders a
row; it disconnects when the user leaves the overview and never observes the
whole page. Header synchronization is separately armed in the capture phase
before Codex handles a known Spawn-row click. A short-lived renderer-root
observer rewrites the header before the next browser paint, disconnecting
900 ms after a match or after a five-second hard timeout. Injection into an
already-open child view uses the same structured mapping as a fallback. Neither
path polls.
Spawn status is normalized to **Starting**, **Working**, **Completed**,
**Interrupted**, or **Failed**, following Codex's own
`pendingInit → waiting` and `running → working` grouping. Because the Spine
progress protocol has no server timestamp, the wrapper records when it locally
observes working and terminal events and labels the resulting value
**Observed runtime**. This is an execution duration, unlike Codex's coarse
relative labels such as “1 minute ago”.
When a Spawn transaction settles, its call ID,
ordinal, child-thread ID, agent path, and observed timing are transferred to the corresponding
Closed Spine node and persisted with the existing bounded snapshot cache, so
the same action remains available after completion and App restarts. Older
cached Spawn nodes without that metadata can still be resolved conservatively
from a unique native result summary; ambiguous matches are never opened.
The UI never turns context growth into a percentage. Context location is
phrased as **Current context** or **Before compaction N**, rather than exposing
Root Epoch IDs as user-facing workflow stages.

Collapsed **previous branches** rows are also buttons: click one to reveal its
actual historical nodes, then click the same row again to fold them back. Tree
expansion state is kept only in memory for the current App session. A completed
node with children also offers **Show subtree** on its detail page, so a
historical branch can be inspected recursively without making the default tree
noisy. **Show subtree** updates both the summary tree and the detail action in
the same frame. Folding a previous-branches bucket, **Earlier context**, or an
individual **Before compaction N** group only hides rows in the summary
projection; an already-open detail remains attached to its node in the
underlying snapshot. Detail closes only when the node truly disappears, the
conversation changes, or the user closes it, preventing a node from one
conversation being shown beside another.

The mount uses Codex's summary marker as a geometric boundary as well as a
structured anchor, so it also works when the marker is an empty layout obstacle
or the card contains only Environment information. Sidebar sections and
subagent panes are excluded without depending on translated section names.

## Spine features

Open **Settings → Agent** and look directly below **Model features**. The
wrapper adds one native-style **Spine features** section. It currently exposes
**Spine JIT**, **Spine Trim**, **Spine Spawn**, and **Spine Tree memory
projection** switches. It does not unlock or modify Codex's private
Experimental features gate, add controls to the summary card, or intercept
slash commands.

The section follows the host selected at the top of Codex Settings. Local and
remote hosts have independent `config.toml` files: changing a local switch
does not change the same switch on a connected remote host. The renderer reads
each host's own catalog through `experimentalFeature/list`, selects the stable
`spine_jit` and `spine_trim` controls plus beta features owned by SpineCodex
(`spine_*` or `spinetree_*`), and writes the selected `features.<name>` key
through Codex's normal `config/batchWrite` flow. This also lets future
SpineCodex beta features appear without a renderer release. The section is
shown only on the Agent settings page, performs no polling, and issues no
requests while Settings is closed.

SpineCodex reloads the latest config whenever a new thread starts, so a full
App restart is not required. The switch deliberately leaves already-running
conversations unchanged and says only that the change applies to new
conversations. Spine JIT enables the task-tree lifecycle and context projection.
Spine Trim lets the model conservatively slice or clear the immediately
preceding large tool-result projection. Spine Spawn makes `spine.spawn`
available when parallel, independent work would be useful; it does not force
every task to spawn. Memory projection writes closed-node memory to Markdown
files under `.codex/spinetree/` in that conversation's workspace.

The wrapper continues to visualize runtime spawn progress inside Spine Tree.

The renderer binds the tree to the conversation currently displayed in Codex's
main thread view. Updates from background conversations are cached but never
rendered into the active conversation, so parallel tasks do not fight over the
panel. Clicking a conversation switches to its cached tree immediately; a
newly-created conversation clears the previous tree while Codex resolves its
real thread ID, without waiting for another Spine event.

The renderer retains compact snapshots for the 32 most recently active
conversations (protecting the conversation currently on screen), and writes
them to a bounded local cache during browser idle time. This lets local and
remote SpineCodex conversations restore their last received tree immediately
after navigation or an App restart instead of waiting for the next live Spine
event. Fresh sequence-numbered notifications replace cached state. Temporary-
to-real thread ID aliases are also persisted, and the section reattaches
synchronously when Codex rebuilds the summary card during navigation.

Live snapshots retain every tree node plus up to 24,000 characters of its
closing memory. The 2,000-node limit applies only to the persisted copy and
always preserves the active path; persisted closing memories are capped at
2,000 characters per node and marked as truncated in the inspector. The
existing 2.5 MB total cache bound still applies, and cached snapshots expire
after 30 days. To clear snapshots, cached details, and temporary thread aliases
immediately from the renderer console, run:

```js
window.__spineCodexViewV1.clearCache()
```

Tree status and hierarchy use small inline SVG icons and CSS connectors—there
are no bitmap assets, text-art branch characters, or context percentages. The
footer reports only the unambiguous node count. While the mounted section is
collapsed, routine events schedule no render frames or DOM updates.

The Spine Tree title and workspace tab use a compact hand-authored mark: three
context nodes converge into one memory capsule. It uses `currentColor` only,
so it follows Codex's native light and dark themes without a separate image
asset.

Options:

- `--spine-codex PATH`: choose the existing SpineCodex binary.
- `--app PATH`: choose the Codex/ChatGPT app bundle.
- `--diagnose`: validate paths and versions without launching.
