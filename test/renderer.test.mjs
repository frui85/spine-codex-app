import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const windowListeners = new Map();
const documentListeners = new Map();
const storage = new Map([["spine-codex.view.expanded", "false"]]);
const idleCallbacks = new Map();
const canonicalThreadId = "00000000-0000-0000-0000-000000000001";
const annotation = {
  getAttribute(name) {
    return name === "data-response-annotation-conversation" ? canonicalThreadId : null;
  },
};
const mainThread = {
  querySelector(selector) {
    return selector === "[data-response-annotation-conversation]" ? annotation : null;
  },
};
let selectedRawId = "local:client-new-thread:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const temporarySidebarItem = {
  getAttribute(name) {
    if (name === "data-app-action-sidebar-thread-id") {
      return selectedRawId;
    }
    return null;
  },
  classList: { contains: () => true },
};
globalThis.window = globalThis;
globalThis.location = { pathname: "/", hash: "" };
globalThis.history = {
  pushState() {},
  replaceState() {},
};
globalThis.localStorage = {
  getItem(key) {
    return storage.get(key) ?? null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
};
let documentLanguage = "en";
let navigatorLanguage = "en";
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    get language() {
      return navigatorLanguage;
    },
  },
});
globalThis.document = {
  body: null,
  documentElement: {
    lang: "en",
    getAttribute(name) {
      return name === "lang" ? documentLanguage : null;
    },
  },
  querySelector(selector) {
    return selector === '[data-pip-anchor-host="codex-main-thread"]' ? mainThread : null;
  },
  querySelectorAll(selector) {
    return selector === "[data-app-action-sidebar-thread-id]" ? [temporarySidebarItem] : [];
  },
  addEventListener(type, listener) {
    documentListeners.set(type, listener);
  },
  removeEventListener(type) {
    documentListeners.delete(type);
  },
};
globalThis.Node = { ELEMENT_NODE: 1 };
globalThis.addEventListener = (type, listener) => windowListeners.set(type, listener);
globalThis.removeEventListener = (type) => windowListeners.delete(type);
let nextFrame = 0;
globalThis.requestAnimationFrame = () => ++nextFrame;
globalThis.cancelAnimationFrame = () => {};
let nextIdle = 0;
globalThis.requestIdleCallback = (callback) => {
  const id = ++nextIdle;
  idleCallbacks.set(id, callback);
  return id;
};
globalThis.cancelIdleCallback = (id) => idleCallbacks.delete(id);

const source = fs.readFileSync(
  new URL("../spine-view.js", import.meta.url),
  "utf8",
);
assert.match(source, /data-pip-obstacle="thread-summary-panel"/);
assert.doesNotMatch(source, /hasSummarySections/);
assert.doesNotMatch(
  source,
  /rect\.right\s*[<>]=?\s*viewportWidth\s*-\s*64/,
);
assert.match(source, /var\(--color-token-text-tertiary/);
assert.doesNotMatch(source, /var\(--token-/);
assert.match(source, /SPINE_LOGO_MARKUP/);
assert.match(source, /M4\.9 5\.2C4\.9 8\.1 7\.2 9\.2 10 10\.6/);
assert.equal((source.match(/\$\{SPINE_LOGO_MARKUP\}/g) ?? []).length, 2);
vm.runInThisContext(source, { filename: "spine_view.js" });

const api = globalThis.__spineCodexViewV1;
assert.equal(api.version, "0.2.2.5");
assert.equal(api.revision, 10);
assert.equal(api.resolveLocale("zh-CN"), "zh-Hans");
assert.equal(api.resolveLocale("zh-TW"), "zh-Hant");
assert.equal(api.resolveLocale("ja-JP"), "ja");
assert.equal(api.resolveLocale("de-DE"), "de");
assert.equal(api.resolveLocale("pt-PT"), "pt-BR");
assert.equal(api.resolveLocale("ar"), "en");
navigatorLanguage = "zh-TW";
assert.equal(api.refreshLocale(), true);
assert.equal(api.getStats().locale, "zh-Hant");
assert.equal(api.translate("tree.empty"), "這個 Spine Tree 是空的。");
navigatorLanguage = "en";
assert.equal(api.refreshLocale(), true);
assert.equal(api.getStats().locale, "en");
documentLanguage = "ja-JP";
assert.equal(api.refreshLocale(), false);
assert.equal(api.getStats().locale, "en");
assert.match(source, /addEventListener\("languagechange", onLanguageChange\)/);
assert.match(source, /removeEventListener\("languagechange", onLanguageChange\)/);
assert.match(source, /vscode:\/\/codex\/\$\{method\}/);
assert.match(source, /key: "localeOverride"/);
assert.match(source, /data\?\.type === "fetch-response"/);
assert.doesNotMatch(source, /suppressAppListUpdateBurst/);
assert.doesNotMatch(source, /APP_LIST_UPDATE_BURST_WINDOW_MS/);
assert.match(source, /data-settings-panel-slug="general-settings"/);
assert.match(source, /function nativeTreeMotionSpec/);
assert.match(source, /--transition-duration-relaxed/);
assert.match(source, /--cubic-enter/);
assert.match(source, /cubic-bezier\(\.19, 1, \.22, 1\)/);
assert.match(source, /\.content-motion \{ display: grid; grid-template-rows: 1fr/);
assert.match(source, /grid-template-rows: 0fr; opacity: 0; margin-top: 0/);
assert.match(source, /\.row:active \{ scale: \.98; \}/);
assert.match(source, /prefers-reduced-motion: reduce/);
assert.match(source, /function summaryPanels/);
assert.match(source, /function pinnedSummarySurfaces/);
assert.match(source, /function containsStructuredSummarySections/);
assert.match(source, /function geometricSummarySurfaces/);
assert.match(source, /function isGeometricSummarySurface/);
assert.match(source, /document\.elementsFromPoint/);
assert.match(source, /rectIntersectionRatio/);
assert.match(source, /marker\.parentElement\?\.children/);
assert.match(source, /surface\.contains\(element\)/);
assert.match(source, /function summaryContainerMetrics/);
assert.match(source, /connectSummarySurfaceObserver/);
assert.match(source, /document\.elementFromPoint/);
assert.match(source, /querySelectorAll\(\s*[\r\n\s]*'\[data-pip-obstacle="thread-summary-panel"\]'/);
assert.doesNotMatch(source, /rect\.left\s*<\s*viewportWidth\s*\*\s*0\.45/);
assert.match(source, /A3\.7 3\.7 0 0 0 12\.35 7\.5/);
assert.match(source, /A3\.4 3\.4 0 0 0 13\.1 8/);
assert.doesNotMatch(source, /A3\.7 3\.7 0 0 0 14 7\.5/);
assert.doesNotMatch(source, /A3\.4 3\.4 0 0 0 14\.5 8/);
assert.match(source, /memorySummaryTruncated/);
assert.match(source, /data-spine-action/);
assert.match(source, /Closing memory|关闭记忆/);
assert.match(source, /Context growth|上下文增量/);
assert.match(source, /Copy node ID|复制节点 ID/);
assert.match(source, /Open subagent|打开子代理/);
assert.match(source, /thread\/name\/set/);
assert.match(source, /friendlySpawnName/);
assert.match(source, /open-child-agent/);
assert.match(source, /thread-summary-panel-item-button/);
assert.match(source, /thread-summary-panel-item-avatar-group/);
assert.match(source, /nativeSpawnTaskIdentity/);
assert.match(source, /pendingInit/);
assert.match(source, /Observed runtime|观测运行时长/);
assert.match(source, /waitForNativeSubagentButton/);
assert.match(source, /findNativeSubagentDetailTitle/);
assert.match(source, /spineSpawnDetailKey/);
assert.match(source, /armNativeSubagentTitleHook/);
assert.match(source, /subagentTitleObserver/);
assert.match(source, /nativeSubagentOverviewRoot/);
assert.match(source, /connectNativeSubagentListObserver/);
assert.match(source, /subagentListObserver/);
assert.match(source, /rawResponseItem\/completed/);
assert.match(source, /SPAWN_INTENT_CACHE_KEY/);
assert.match(
  source,
  /thread-summary-panel-item-group/,
);
assert.match(
  source,
  /function armNativeSubagentTitleHook[\s\S]{0,500}const root = document\.body/,
);
assert.doesNotMatch(
  source,
  /nativeSubagentRows\(\)[\s\S]{0,900}querySelector\(["']time["']\)/,
);
assert.doesNotMatch(
  source,
  /querySelectorAll\(\s*['"]button\[aria-label=["'](?:打开子代理|Open subagent)/,
);
assert.doesNotMatch(source, /spawn-button|spawn-panel|parseSpawnCommand/);
assert.match(source, /experimentalFeature\/list/);
assert.match(source, /config\/batchWrite/);
assert.match(source, /features\.\$\{featureName\}/);
assert.match(source, /spinetree_memory_projection/);
assert.match(source, /SPINE_FEATURE_PREFIX/);
assert.match(source, /SPINE_STABLE_SETTINGS_FEATURES/);
assert.match(source, /feature\.stage === "beta"/);
assert.match(source, /reloadUserConfig: false/);
assert.match(source, /data-settings-panel-slug="agent"/);
assert.match(source, /aria-haspopup.*menu/);
assert.doesNotMatch(source, /2106641128|__spineCodexStatsigGateOverride/);
assert.doesNotMatch(source, /Restart ChatGPT|重启 ChatGPT/);
assert.deepEqual(
  api.selectSettingsFeatures([
    { name: "spine_spawn", stage: "beta", enabled: true },
    { name: "spinetree_memory_projection", stage: "beta", enabled: false },
    { name: "spine_future_feature", stage: "beta", enabled: true },
    { name: "spine_jit", stage: "stable", enabled: true },
    { name: "spine_trim", stage: "stable", enabled: true },
    { name: "spine_future_stable", stage: "stable", enabled: true },
    { name: "memories", stage: "beta", enabled: true },
    { name: "spine.invalid", stage: "beta", enabled: true },
  ]).map((feature) => [feature.name, feature.enabled]),
  [
    ["spine_jit", true],
    ["spine_trim", true],
    ["spine_spawn", true],
    ["spinetree_memory_projection", false],
    ["spine_future_feature", true],
  ],
);
const snapshot = {
  threadId: canonicalThreadId,
  turnId: "turn",
  snapshotSeq: 2,
  activeNodeId: "1.3.1",
  settledSpawnCallIds: [],
  nodes: [
    { nodeId: "1", parentId: null, kind: "root_epoch", status: "opened", start: 1 },
    {
      nodeId: "1.1",
      parentId: "1",
      kind: "task",
      status: "closed",
      summary: "Finished",
      memorySummary: "Verified the implementation and retained the decisive evidence.",
      start: 2,
      end: 8,
      contextPressure: {
        openInputTokens: 10_000,
        currentInputTokens: 42_000,
        contextTokens: 32_000,
        problem: null,
      },
    },
    {
      nodeId: "1.1.1",
      parentId: "1.1",
      kind: "task",
      status: "closed",
      summary: "Nested historical work",
      start: 2.5,
      end: 7,
    },
    { nodeId: "1.2", parentId: "1", kind: "task", status: "closed", summary: null, start: 3 },
    { nodeId: "1.3", parentId: "1", kind: "task", status: "opened", summary: "Implement", start: 4 },
    { nodeId: "1.3.1", parentId: "1.3", kind: "task", status: "live", summary: "Verify", start: 5 },
  ],
};
assert.equal(
  api.ingest({ type: "mcp-notification", method: "turn/spineTree/updated", params: snapshot }),
  true,
);
assert.equal(
  api.ingest({
    type: "mcp-notification",
    method: "rawResponseItem/completed",
    hostId: "local",
    params: {
      threadId: snapshot.threadId,
      turnId: "turn-interrupted",
      item: {
        type: "function_call",
        namespace: "spine",
        name: "spawn",
        call_id: "call_orphan-123",
        arguments: JSON.stringify({
          tasks: [
            { summary: "Recover interrupted branch", prompt: "must not be stored" },
            { summary: "Persist before progress", prompt: "private branch prompt" },
          ],
        }),
      },
    },
  }),
  true,
);
const interruptedIntents = api.exportSpawnIntents();
assert.equal(interruptedIntents.length, 1);
assert.equal(interruptedIntents[0][1][0].callId, "call_orphan-123");
assert.deepEqual(
  interruptedIntents[0][1][0].tasks.map(({ ordinal, summary, threadId }) => ({
    ordinal,
    summary,
    threadId,
  })),
  [
    { ordinal: 0, summary: "Recover interrupted branch", threadId: null },
    { ordinal: 1, summary: "Persist before progress", threadId: null },
  ],
);
const spawnIntentPayload = storage.get("spine-codex.view.spawn-intents.v1");
assert.ok(spawnIntentPayload);
assert.doesNotMatch(spawnIntentPayload, /must not be stored|private branch prompt/);
assert.equal(
  api.ingest({
    type: "mcp-notification",
    method: "rawResponseItem/completed",
    params: {
      threadId: snapshot.threadId,
      item: {
        type: "function_call",
        namespace: "other",
        name: "spawn",
        call_id: "call_wrong",
        arguments: "{}",
      },
    },
  }),
  false,
);
const sameSequenceSnapshot = {
  ...snapshot,
  settledSpawnCallIds: ["same-sequence-settled"],
  nodes: snapshot.nodes.map((node) =>
    node.nodeId === snapshot.activeNodeId
      ? { ...node, summary: "Verify equal sequence replacement" }
      : node),
};
assert.equal(
  api.ingest({
    type: "mcp-notification",
    method: "turn/spineTree/updated",
    params: sameSequenceSnapshot,
  }),
  true,
);
assert.equal(
  api.ingest({
    type: "mcp-notification",
    method: "turn/spineSpawnProgress/updated",
    hostId: "local",
    params: {
      threadId: snapshot.threadId,
      turnId: "turn",
      callId: "call_demo-123",
      tasks: [{
        ordinal: 0,
        summary: "Inspect the native subagent",
        threadId: "00000000-0000-0000-0000-000000000099",
        agentPath: "root/spawn_calldemo123_0",
        status: "completed",
      }],
    },
  }),
  true,
);
const settledSpawnSnapshot = {
  ...sameSequenceSnapshot,
  snapshotSeq: 3,
  settledSpawnCallIds: ["call_demo-123"],
  nodes: [
    ...sameSequenceSnapshot.nodes,
    {
      nodeId: "1.3.2",
      parentId: "1.3",
      kind: "task",
      status: "closed",
      summary: "Inspect the native subagent",
      memorySummary: "Native subagent inspected.",
      spawnOutcome: "completed",
      start: 6,
      end: 7,
    },
  ],
};
assert.equal(
  api.ingest({
    type: "mcp-notification",
    method: "turn/spineTree/updated",
    params: settledSpawnSnapshot,
  }),
  true,
);
const settledSpawnDetail = api.getNodeDetail(
  api.exportSnapshots().find((entry) => entry.threadId === canonicalThreadId),
  "1.3.2",
);
assert.deepEqual(
  {
    callId: settledSpawnDetail.spawnLink.callId,
    ordinal: settledSpawnDetail.spawnLink.ordinal,
    threadId: settledSpawnDetail.spawnLink.threadId,
    agentPath: settledSpawnDetail.spawnLink.agentPath,
    summary: settledSpawnDetail.spawnLink.summary,
    startedAtMs: settledSpawnDetail.spawnLink.startedAtMs,
    completedAtType: typeof settledSpawnDetail.spawnLink.completedAtMs,
  },
  {
    callId: "call_demo-123",
    ordinal: 0,
    threadId: "00000000-0000-0000-0000-000000000099",
    agentPath: "root/spawn_calldemo123_0",
    summary: "Inspect the native subagent",
    startedAtMs: null,
    completedAtType: "number",
  },
);
assert.equal(
  api.nativeSpawnTaskTitle("call_demo-123", 0),
  "Spawn calldemo123 0",
);
assert.equal(api.normalizeSpawnStatus("preInit"), "pendingInit");
assert.equal(api.normalizeSpawnStatus("working"), "running");
assert.equal(api.spawnPhase("pendingInit"), "waiting");
assert.equal(api.spawnPhase("running"), "working");
assert.equal(api.spawnPhase("interrupted"), "done");
const waitingTask = api.mergeSpawnTask(
  { ordinal: 0, status: "pendingInit" },
  null,
  1_000,
);
const workingTask = api.mergeSpawnTask(
  { ordinal: 0, status: "running" },
  waitingTask,
  5_000,
);
const nonRegressedTask = api.mergeSpawnTask(
  { ordinal: 0, status: "pendingInit" },
  workingTask,
  6_000,
);
const completedTask = api.mergeSpawnTask(
  { ordinal: 0, status: "completed" },
  nonRegressedTask,
  35_000,
);
assert.equal(nonRegressedTask.status, "running");
assert.equal(completedTask.startedAtMs, 5_000);
assert.equal(completedTask.completedAtMs, 35_000);
assert.equal(api.spawnTimingText(completedTask, 40_000), "Ran for 30s");
assert.match(
  api.spawnTimingDetail(completedTask, 40_000),
  /\d{2}:\d{2}:\d{2} → \d{2}:\d{2}:\d{2} · Ran for 30s/,
);
const terminalOnlyTask = api.mergeSpawnTask(
  { ordinal: 1, status: "completed" },
  null,
  50_000,
);
assert.equal(terminalOnlyTask.startedAtMs, null);
assert.equal(api.spawnTimingText(terminalOnlyTask, 55_000), null);

const originalQuerySelectorAll = document.querySelectorAll;
globalThis.innerHeight = 1_000;
const activeNativeTitle = {
  children: [],
  textContent: "Spawn calldemo123 0",
};
let activeNativeClicks = 0;
const activeNativeButton = {
  isConnected: true,
  dataset: {},
  matches: () => false,
  getBoundingClientRect: () => ({
    width: 300,
    height: 48,
    top: 100,
    bottom: 148,
  }),
  querySelector(selector) {
    return selector === ":scope > img[aria-hidden='true']" ? {} : null;
  },
  querySelectorAll(selector) {
    return selector === "span" ? [activeNativeTitle] : [];
  },
  click() {
    activeNativeClicks += 1;
  },
};
const nativeDetailHeader = {
  querySelector(selector) {
    return [
      ":scope > button",
      ":scope > img[aria-hidden='true']",
    ].includes(selector) ? {} : null;
  },
  getBoundingClientRect: () => ({
    width: 620,
    height: 48,
    top: 0,
  }),
};
const nativeDetailTitle = {
  isConnected: true,
  children: [],
  dataset: {},
  parentElement: nativeDetailHeader,
  textContent: "Spawn calldemo123 0",
  getBoundingClientRect: () => ({
    width: 230,
    height: 20,
  }),
};
document.querySelectorAll = (selector) =>
  selector === "button"
    ? [activeNativeButton]
    : selector === "span"
      ? [nativeDetailTitle]
      : originalQuerySelectorAll(selector);
assert.equal(
  api.findNativeSubagentButton({ callId: "call_demo-123", ordinal: 0 }),
  activeNativeButton,
);
assert.equal(
  api.findNativeSubagentDetailTitle({ callId: "call_demo-123", ordinal: 0 }),
  nativeDetailTitle,
);
assert.equal(
  api.syncNativeSubagentDetailTitle({
    callId: "call_demo-123",
    ordinal: 0,
    summary: "Inspect the native subagent",
  }),
  true,
);
assert.equal(nativeDetailTitle.textContent, "Inspect the native subagent");
assert.equal(nativeDetailTitle.dataset.spineSpawnDetailKey, "calldemo123:0");
assert.equal(
  await api.openNativeSubagent({
    callId: "call_demo-123",
    ordinal: 0,
    threadId: "00000000-0000-0000-0000-000000000099",
    summary: "Inspect the native subagent",
  }),
  true,
);
assert.equal(activeNativeClicks, 1);
document.querySelectorAll = originalQuerySelectorAll;
assert.equal(
  api.exportSnapshots()
    .find((entry) => entry.threadId === canonicalThreadId)
    .nodes.find((node) => node.nodeId === snapshot.activeNodeId)
    .summary,
  "Verify equal sequence replacement",
);
assert.equal(
  api.ingest({
    type: "mcp-notification",
    method: "turn/spineTree/updated",
    params: { ...snapshot, snapshotSeq: 1 },
  }),
  false,
);
assert.equal(
  api.ingest({
    type: "mcp-notification",
    method: "turn/spineSpawnProgress/updated",
    params: {
      threadId: snapshot.threadId,
      turnId: "turn",
      callId: "spawn",
      tasks: [{ ordinal: 0, summary: "Parallel check", status: "running" }],
    },
  }),
  true,
);

const rows = api.projectSnapshot(snapshot);
assert.equal(rows.some((row) => row.label === "Spine Tree"), false);
assert.equal(
  rows.some((row) => row.kind === "epoch" || row.kind === "context-history"),
  false,
);
assert.equal(rows.find((row) => row.nodeId === "1.3")?.depth, 0);
assert.equal(rows.some((row) => row.label === "Verify" && row.icon === "running"), true);
assert.equal(rows.some((row) => row.label === "Parallel check"), true);
assert.equal(rows.some((row) => "prefix" in row || "marker" in row), false);
const historyBucket = rows.find((row) => row.kind === "bucket");
assert.equal(typeof historyBucket?.bucketKey, "string");
assert.equal(api.setBucketExpanded(historyBucket.bucketKey, true), true);
const expandedRows = api.projectSnapshot(snapshot);
assert.equal(
  expandedRows.some((row) => row.kind === "node" && row.nodeId === "1.2"),
  true,
);
assert.equal(
  expandedRows.some((row) => row.kind === "bucket" && row.expanded === true),
  true,
);
const historicalRow = expandedRows.find((row) =>
  row.kind === "node" && row.nodeId === "1.2");
assert.ok(historicalRow);
assert.equal(api.setBucketExpanded(historyBucket.bucketKey, false), true);
assert.equal(
  api.projectSnapshot(snapshot).some((row) => row.key === historicalRow.key),
  false,
);
assert.deepEqual(
  {
    key: api.resolveDetailItem(snapshot, historicalRow.key)?.key,
    nodeId: api.resolveDetailItem(snapshot, historicalRow.key)?.nodeId,
    hiddenFromTree:
      api.resolveDetailItem(snapshot, historicalRow.key)?.hiddenFromTree,
  },
  {
    key: historicalRow.key,
    nodeId: "1.2",
    hiddenFromTree: true,
  },
);
assert.equal(api.resolveDetailItem(snapshot, "node:missing"), null);
assert.equal(api.setBucketExpanded(historyBucket.bucketKey, true), true);
const closedParentRow = expandedRows.find((row) => row.nodeId === "1.1");
assert.equal(closedParentRow.subtreeCollapsed, true);
assert.equal(
  expandedRows.some((row) => row.nodeId === "1.1.1"),
  false,
);
assert.equal(api.setSubtreeExpanded(closedParentRow.subtreeKey, true), true);
assert.equal(
  api.projectSnapshot(snapshot).some((row) => row.nodeId === "1.1.1"),
  true,
);
const finishedDetail = api.getNodeDetail(
  api.exportSnapshots().find((entry) => entry.threadId === canonicalThreadId),
  "1.1",
);
assert.deepEqual(
  {
    nodeId: finishedDetail.nodeId,
    memorySummary: finishedDetail.memorySummary,
    childCount: finishedDetail.childCount,
    path: finishedDetail.path,
    contextTokens: finishedDetail.contextPressure.contextTokens,
    end: finishedDetail.end,
  },
  {
    nodeId: "1.1",
    memorySummary: "Verified the implementation and retained the decisive evidence.",
    childCount: 1,
    path: ["1", "1.1"],
    contextTokens: 32_000,
    end: 8,
  },
);

const multiEpochSnapshot = {
  threadId: canonicalThreadId,
  turnId: "epoch-turn",
  snapshotSeq: 3,
  activeNodeId: "3.1",
  settledSpawnCallIds: [],
  nodes: [
    { nodeId: "1", parentId: null, kind: "root_epoch", status: "compacted", start: 0, end: 20 },
    { nodeId: "1.1", parentId: "1", kind: "task", status: "compacted", summary: "Old epoch task", start: 1, end: 20 },
    { nodeId: "2", parentId: null, kind: "root_epoch", status: "compacted", start: 20, end: 40 },
    { nodeId: "2.1", parentId: "2", kind: "task", status: "compacted", summary: "Middle epoch task", start: 21, end: 40 },
    { nodeId: "3", parentId: null, kind: "root_epoch", status: "opened", start: 40 },
    { nodeId: "3.1", parentId: "3", kind: "task", status: "live", summary: "Current epoch task", start: 41 },
  ],
};
const epochRows = api.projectSnapshot(multiEpochSnapshot);
const contextHistoryRow = epochRows.find((row) => row.kind === "context-history");
assert.ok(contextHistoryRow);
assert.equal(contextHistoryRow.expanded, false);
assert.equal(contextHistoryRow.compactionCount, 2);
assert.equal(epochRows.some((row) => row.nodeId === "1.1"), false);
assert.equal(epochRows.find((row) => row.nodeId === "3.1")?.depth, 0);
assert.equal(
  epochRows.some((row) =>
    row.kind === "epoch" || /Context epoch|上下文阶段/.test(row.label ?? "")),
  false,
);
assert.equal(
  api.setEpochExpanded(`${canonicalThreadId}:context-history`, true),
  true,
);
const contextEpochRows = api.projectSnapshot(multiEpochSnapshot)
  .filter((row) => row.kind === "context-epoch");
assert.deepEqual(
  contextEpochRows.map((row) => ({
    label: row.label,
    depth: row.depth,
    expanded: row.expanded,
    taskCount: row.taskCount,
  })),
  [
    {
      label: "Before compaction 1",
      depth: 1,
      expanded: false,
      taskCount: 1,
    },
    {
      label: "Before compaction 2",
      depth: 1,
      expanded: false,
      taskCount: 1,
    },
  ],
);
assert.equal(
  api.projectSnapshot(multiEpochSnapshot).some((row) => row.nodeId === "1.1"),
  false,
);
assert.equal(
  api.setEpochExpanded(`${canonicalThreadId}:context-epoch:1`, true),
  true,
);
assert.equal(
  api.projectSnapshot(multiEpochSnapshot).find((row) => row.nodeId === "1.1")?.depth,
  2,
);
assert.equal(
  api.projectSnapshot(multiEpochSnapshot).some((row) => row.nodeId === "2.1"),
  false,
);
const historicalEpochRow = api.projectSnapshot(multiEpochSnapshot)
  .find((row) => row.nodeId === "1.1");
assert.ok(historicalEpochRow);
assert.equal(
  api.setEpochExpanded(`${canonicalThreadId}:context-history`, false),
  true,
);
assert.equal(
  api.projectSnapshot(multiEpochSnapshot)
    .some((row) => row.key === historicalEpochRow.key),
  false,
);
assert.equal(
  api.resolveDetailItem(multiEpochSnapshot, historicalEpochRow.key)?.nodeId,
  "1.1",
);
assert.equal(
  api.setEpochExpanded(`${canonicalThreadId}:context-epoch:1`, false),
  true,
);
assert.match(source, /spine-codex-workspace-detail/);
assert.match(source, /spine-codex-workspace-tab/);
assert.match(source, /data-app-shell-tabs="true"/);
assert.match(source, /data-app-shell-tab-strip-controller="right"/);
assert.match(source, /:scope > \[role="tablist"\]/);
assert.match(source, /tabStrip\.querySelector\('\[role="tablist"\]'\)/);
assert.match(source, /while \(tabTrack\.parentElement/);
assert.match(source, /ui\.tabTrack\.style\.width/);
assert.match(source, /tabList\.append\(tabHost\)/);
assert.match(source, /workspaceTabListWidth/);
assert.match(source, /setWorkspaceDetailActive/);
assert.match(source, /ui\.host\.style\.display = ui\.active \? "block" : "none"/);
assert.match(source, /tabStrip\.addEventListener\("click", ui\.onTabStripClick, true\)/);
assert.match(source, /ui\.tabStrip\.removeEventListener\("click", ui\.onTabStripClick, true\)/);
assert.match(source, /attributeFilter: \["style"\]/);
assert.doesNotMatch(
  source,
  /tabHost\.style\.cssText\s*=\s*[\s\S]{0,160}"position:absolute;inset:0/,
);
assert.match(source, /data-app-shell-focus-area="right-panel"/);
assert.match(source, /rect\.right <= viewportWidth \+ 1/);
assert.match(source, /shellRect\.width >= Math\.min\(240, rect\.width \* 0\.75\)/);
assert.match(source, /state\.detailPaneCollapsedFrames >= 4/);
assert.match(source, /state\.detailPaneStableFrames < 2/);
assert.match(source, /state\.detailMountRetries < 2/);
assert.match(source, /collapsedPreview/);
assert.doesNotMatch(source, /\.row\.selected\s*\{[^}]*background:/);
assert.doesNotMatch(source, /\.row\.active\s*\{[^}]*background:/);
assert.match(source, /-webkit-app-region:\s*no-drag/);
assert.match(source, /detailSurface: "workspace-sidebar"/);
assert.doesNotMatch(
  source,
  /spine-codex-detail-view|restoreSummaryContainer|nativePanels|saved\.element\.inert/,
);
assert.match(
  source,
  /expandedSubtrees\.(?:has|add|delete)[\s\S]{0,500}renderActiveNow\(true\);[\s\S]{0,100}scheduleWorkspaceDetailRefresh\(\);/,
);
assert.match(
  source,
  /const selectedItem = selectedKey[\s\S]{0,180}resolveWorkspaceDetailItem\(snapshot, selectedKey, projected\)/,
);
assert.doesNotMatch(source, /selectedKey && !selectedVisible/);

const secondThreadId = "00000000-0000-0000-0000-000000000002";
for (let index = 2; index <= 13; index += 1) {
  const suffix = String(index).padStart(12, "0");
  assert.equal(
    api.ingest({
      type: "mcp-notification",
      method: "turn/spineTree/updated",
      params: {
        ...snapshot,
        threadId: `00000000-0000-0000-0000-${suffix}`,
        snapshotSeq: 1,
      },
    }),
    true,
  );
}
documentListeners.get("click")({
  target: {
    nodeType: Node.ELEMENT_NODE,
    closest() {
      return {
        getAttribute(name) {
          return name === "data-app-action-sidebar-thread-id"
            ? `remote:${secondThreadId}`
            : null;
        },
      };
    },
  },
});
assert.equal(api.getStats().activeThreadId, secondThreadId);
selectedRawId = `remote:${secondThreadId}`;
await Promise.resolve();
const longActiveNodeId = "long.2004";
const longNodes = [
  {
    nodeId: "long-root",
    parentId: null,
    kind: "root_epoch",
    status: "opened",
    start: 0,
  },
  ...Array.from({ length: 2_005 }, (_, index) => ({
    nodeId: `long.${index}`,
    parentId: "long-root",
    kind: "task",
    status: index === 2_004 ? "live" : "closed",
    summary: `Long node ${index}`,
    memorySummary: index === 2_004 ? "m".repeat(5_000) : null,
    spawnOutcome: index === 2_003 ? "completed" : null,
    spawnLink: index === 2_003
      ? {
          callId: "call_persisted",
          ordinal: 2,
          threadId: "00000000-0000-0000-0000-000000000098",
          agentPath: "root/spawn_callpersisted_2",
          summary: "Persisted child",
        }
      : null,
    contextPressure: index === 2_004
      ? {
          openInputTokens: 100_000,
          currentInputTokens: 112_345,
          contextTokens: 12_345,
          problem: null,
        }
      : null,
    start: index + 1,
  })),
];
assert.equal(
  api.ingest({
    type: "mcp-notification",
    method: "turn/spineTree/updated",
    params: {
      threadId: secondThreadId,
      turnId: "long-turn",
      snapshotSeq: 2,
      activeNodeId: longActiveNodeId,
      settledSpawnCallIds: [],
      nodes: longNodes,
    },
  }),
  true,
);
assert.equal(
  api.exportSnapshots().find((entry) => entry.threadId === secondThreadId).nodes.length,
  longNodes.length,
);
for (let index = 14; index <= 45; index += 1) {
  const suffix = String(index).padStart(12, "0");
  assert.equal(
    api.ingest({
      type: "mcp-notification",
      method: "turn/spineTree/updated",
      params: {
        ...snapshot,
        threadId: `00000000-0000-0000-0000-${suffix}`,
        snapshotSeq: 1,
      },
    }),
    true,
  );
}

assert.deepEqual(api.getStats(), {
  open: false,
  embedded: false,
  activeThreadId: secondThreadId,
  activeCached: true,
  threads: 32,
  rows: 0,
  framePending: false,
  mountPending: true,
  settingsEmbedded: false,
  settingsHostId: null,
  settingsAvailable: false,
  settingsEnabled: false,
  settingsFeatures: [],
  settingsLoading: false,
  settingsSaving: false,
  locale: "en",
  localeSource: "en",
  localeOverride: undefined,
  localeSettingLoaded: false,
  localeSyncPending: false,
  supportedLocales: [
    "en",
    "zh-Hans",
    "zh-Hant",
    "ja",
    "ko",
    "de",
    "fr",
    "es",
    "pt-BR",
    "ru",
  ],
  detailOpen: false,
  detailMounted: false,
  detailSurface: "workspace-sidebar",
  detailMountPending: false,
  treeMotionPending: false,
  expandedBuckets: 1,
  expandedEpochs: 0,
  expandedSubtrees: 1,
  subagentLabelSyncPending: false,
  subagentListObserved: false,
  subagentTitleHookPending: false,
});
assert.equal(windowListeners.has("message"), true);
const messageListener = windowListeners.get("message");
let stoppedAppListUpdates = 0;
for (const data of [
  { id: "one", title: "First state" },
  { id: "two", title: "Changed state" },
]) {
  messageListener({
    data: {
      type: "mcp-notification",
      method: "app/list/updated",
      params: { data: [data] },
    },
    stopImmediatePropagation() {
      stoppedAppListUpdates += 1;
    },
  });
}
assert.equal(stoppedAppListUpdates, 0);
for (const [id, callback] of idleCallbacks) {
  idleCallbacks.delete(id);
  callback({ didTimeout: false, timeRemaining: () => 50 });
}
const persisted = JSON.parse(storage.get("spine-codex.view.snapshots.v1"));
assert.equal(persisted.version, 1);
assert.equal(persisted.entries.length, 32);
assert.equal(
  persisted.entries.some(([threadId]) => threadId === secondThreadId),
  true,
);
const persistedLongSnapshot = persisted.entries
  .find(([threadId]) => threadId === secondThreadId)[1];
assert.equal(persistedLongSnapshot.nodes.length, 2_000);
assert.equal(
  persistedLongSnapshot.nodes.some((node) => node.nodeId === longActiveNodeId),
  true,
);
assert.equal(
  persistedLongSnapshot.nodes.some((node) => node.nodeId === "long-root"),
  true,
);
const persistedLongActive = persistedLongSnapshot.nodes
  .find((node) => node.nodeId === longActiveNodeId);
assert.equal(persistedLongActive.memorySummary.length, 2_000);
assert.equal(persistedLongActive.memorySummaryTruncated, true);
assert.equal(persistedLongActive.contextPressure.contextTokens, 12_345);
assert.deepEqual(
  persistedLongSnapshot.nodes.find((node) => node.nodeId === "long.2003").spawnLink,
  {
    callId: "call_persisted",
    ordinal: 2,
    threadId: "00000000-0000-0000-0000-000000000098",
    agentPath: "root/spawn_callpersisted_2",
    summary: "Persisted child",
    observedAtMs: null,
    startedAtMs: null,
    completedAtMs: null,
  },
);
const staleEntry = persisted.entries.find(([threadId]) => threadId !== secondThreadId);
staleEntry[1].cachedAt = Date.now() - 31 * 24 * 60 * 60 * 1_000;
storage.set("spine-codex.view.snapshots.v1", JSON.stringify(persisted));
api.destroy();

vm.runInThisContext(source, { filename: "spine_view_restored.js" });
const restoredApi = globalThis.__spineCodexViewV1;
assert.equal(restoredApi.version, "0.2.2.5");
assert.equal(restoredApi.revision, 10);
assert.equal(
  restoredApi.exportSpawnIntents()[0][1].some(
    (intent) => intent.callId === "call_orphan-123" &&
      intent.tasks[0].summary === "Recover interrupted branch",
  ),
  true,
);
documentListeners.get("click")({
  target: {
    nodeType: Node.ELEMENT_NODE,
    closest() {
      return {
        getAttribute(name) {
          return name === "data-app-action-sidebar-thread-id"
            ? `remote:${secondThreadId}`
            : null;
        },
      };
    },
  },
});
assert.equal(restoredApi.getStats().activeThreadId, secondThreadId);
assert.equal(restoredApi.getStats().activeCached, true);
assert.equal(restoredApi.getStats().threads, 31);
assert.equal(restoredApi.clearCache(), true);
assert.equal(restoredApi.getStats().threads, 0);
assert.equal(storage.has("spine-codex.view.snapshots.v1"), false);
assert.equal(storage.has("spine-codex.view.spawn-intents.v1"), false);
assert.equal(storage.has("spine-codex.view.thread-aliases"), false);
restoredApi.destroy();

console.log(
  "spine_view.js sequence, projection, interrupted Spawn intent persistence, spawn navigation and detail-title naming, settings integration contract, long-tree persistence, click switching, TTL, and clear-cache checks passed",
);
