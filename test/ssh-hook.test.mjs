import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const hookPath = new URL(
  "../spine-electron-main-hook.cjs",
  import.meta.url,
);
const wrapperPath = new URL(
  "../spine-app.mjs",
  import.meta.url,
);
const shimPath = new URL(
  "../bin/spine-codex",
  import.meta.url,
);
const rendererPath = new URL("../spine-view.js", import.meta.url);
const mainHookReadinessPath = new URL(
  "../lib/main-hook-readiness.mjs",
  import.meta.url,
);

const hook = require(fileURLToPath(hookPath));
const hookSource = await readFile(hookPath, "utf8");
const wrapperSource = await readFile(wrapperPath, "utf8");
const shimSource = await readFile(shimPath, "utf8");
const rendererSource = await readFile(rendererPath, "utf8");
const mainHookReadinessSource = await readFile(mainHookReadinessPath, "utf8");

assert.equal(hook.DEFAULT_MIN_SPINE_VERSION, "0.2.2");
assert.deepEqual(hook.parseVersion("0.2.2"), [0, 2, 2]);
assert.deepEqual(hook.parseVersion("v1.3.5+build.7"), [1, 3, 5]);
assert.equal(hook.parseVersion("0.2.2-beta.1"), null);
assert.equal(hook.versionAtLeast("0.2.2", "0.2.2"), true);
assert.equal(hook.versionAtLeast("0.2.3", "0.2.2"), true);
assert.equal(hook.versionAtLeast("1.0.0", "0.2.2"), true);
assert.equal(hook.versionAtLeast("0.2.1", "0.2.2"), false);

const modernElectronApi = { app: { modern: true } };
const legacyElectronApi = { app: { legacy: true } };
const modernRequests = [];
assert.equal(
  hook.loadElectronMainApi((specifier) => {
    modernRequests.push(specifier);
    return modernElectronApi;
  }),
  modernElectronApi,
);
assert.deepEqual(modernRequests, ["electron/main"]);
const legacyRequests = [];
assert.equal(
  hook.loadElectronMainApi((specifier) => {
    legacyRequests.push(specifier);
    if (specifier === "electron/main") {
      const error = new Error("Cannot find module 'electron/main'");
      error.code = "MODULE_NOT_FOUND";
      throw error;
    }
    return legacyElectronApi;
  }),
  legacyElectronApi,
);
assert.deepEqual(legacyRequests, ["electron/main", "electron"]);
assert.throws(
  () => hook.loadElectronMainApi(() => {
    const error = new Error("Cannot find module 'unexpected-child'");
    error.code = "MODULE_NOT_FOUND";
    throw error;
  }),
  /unexpected-child/,
);

const localSelectorSource =
  "const localCliError=`Unable to locate the Codex CLI binary. Set CODEX_CLI_PATH or ensure the Electron resources include bin/codex.`;" +
  "function BB(){let e=process.env.CODEX_CLI_PATH;if(e==null)return null;" +
  "let t=e.trim();return t.length===0?null:t}";

function versionFixture({ check, argument, zero, compare, minimum, exportName }) {
  return (
    "var exports={};" +
    `${minimum}=\`0.141.0\`,` +
    "prefix=`codex-app-server-version-unsupported:`," +
    `${zero}=\`0.0.0\`;` +
    `function ${compare}(e,t){` +
    "let a=e.split(/[.+-]/).slice(0,3).map(Number)," +
    "b=t.split(/[.+-]/).slice(0,3).map(Number);" +
    "for(let i=0;i<3;i+=1){if(a[i]!==b[i])return a[i]-b[i]}return 0}" +
    `function ${check}(${argument}){return ` +
    `${argument}===${zero}||${compare}(${argument},${minimum})>=0}` +
    `Object.defineProperty(exports,\`${exportName}\`,` +
    `{enumerable:!0,get:function(){return ${check}}})`
  );
}

for (const fixture of [
  {
    check: "oldCheck",
    argument: "e",
    zero: "oldZero",
    compare: "oldCompare",
    minimum: "oldMinimum",
    exportName: "wc",
  },
  {
    check: "newCheck",
    argument: "candidate",
    zero: "newZero",
    compare: "newCompare",
    minimum: "newMinimum",
    exportName: "mc",
  },
]) {
  const source = localSelectorSource + versionFixture(fixture);
  const patchedVersion = hook.patchVersionCompatibilitySource(source, "0.2.2");
  const check = Function(`${patchedVersion};return ${fixture.check}`)();
  assert.equal(check("0.0.0"), true);
  assert.equal(check("0.141.0"), true);
  assert.equal(check("0.2.2"), true);
  assert.equal(check("0.2.2+build.7"), true);
  assert.equal(check("0.3.0"), true);
  assert.equal(check("0.2.3-beta.1"), false);
  assert.equal(check("0.2.1"), false);
  assert.equal(
    hook.patchVersionBundleCandidateSource(
      "/app/.vite/build/src-Bn_6ASpg.js",
      source,
      "0.2.2",
    ),
    hook.patchLocalCliSelectorSource(patchedVersion),
  );
}
assert.equal(
  hook.patchVersionBundleCandidateSource(
    "/app/.vite/build/src-runtime.js",
    "const unrelated = true;",
  ),
  null,
);
assert.throws(
  () => hook.patchVersionCompatibilitySource("const unrelated = true;"),
  /marker was not found/,
);
assert.doesNotMatch(hookSource, /value\.wc|value\.Cc|value\.Sc/);
assert.match(hookSource, /isMainThread/);

const patchedLocalSelector = hook.patchLocalCliSelectorSource(
  localSelectorSource,
);
const selectLocalCli = new Function(
  "process",
  `${patchedLocalSelector};return BB;`,
);
assert.equal(
  selectLocalCli({
    env: {
      CODEX_CLI_PATH: "spine-codex",
      SPINE_CODEX_LOCAL_CLI_PATH: "/private/wrapper/bin/spine-codex",
    },
  })(),
  "/private/wrapper/bin/spine-codex",
);
assert.equal(
  selectLocalCli({ env: { CODEX_CLI_PATH: "spine-codex" } })(),
  "spine-codex",
);
assert.throws(
  () => hook.patchLocalCliSelectorSource("const unrelated = true;"),
  /marker was not found/,
);

const remoteSelectorSource =
  "function Pae(){let e=process.env.CODEX_CLI_PATH;if(e==null)return null;" +
  "let t=e.trim();return t.length===0?null:t}" +
  "function Fae(e){return/[\\\\/]/.test(e)||/^[a-zA-Z]:/.test(e)}" +
  "function Iae(){let e=Pae();return e==null||Fae(e)?null:e}" +
  "function $S(){return Iae()??Aae}";
const remoteBootstrapSource =
  "function quote(e){return e}" +
  "let logPath=\"/tmp/app-server.log\";" +
  "let command=[`prefix`,` && (pkill -9 -U \\\"$(id -u)\\\" -f `," +
  "quote(`${cli}.*[d]esktop-ssh-websocket-v0.sock`)," +
  "` || true) && nohup `,`spine-codex`,` >${logPath} 2>&1 &`].join(``);";
const forwardedAgentBootstrapSource =
  "function quote(e){return e}" +
  "let logPath=\"/tmp/app-server.log\"," +
  "agentSocket=\"/tmp/forwarded-ssh-agent.sock\"," +
  "prepareAgent=\"prepare-forwarded-agent\";" +
  "let command=[`prefix`,` && (pkill -9 -U \\\"$(id -u)\\\" -f `," +
  "quote(`${cli}.*[d]esktop-ssh-websocket-v0.sock`)," +
  "` || true) && `,prepareAgent,` && SSH_AUTH_SOCK=`,agentSocket,` nohup `," +
  "`spine-codex`,` >${logPath} 2>&1 &`].join(``);";
const groupedForwardedAgentBootstrapSource =
  "function quote(e){return e}" +
  "let controlDir=\"/tmp/app-server-control\"," +
  "logPath=\"/tmp/app-server.log\"," +
  "agentSocket=\"/tmp/forwarded-ssh-agent.sock\"," +
  "prepareAgent=\"prepare-forwarded-agent\";" +
  "let command=[`prefix; `,`(umask 077; mkdir -p -- `,controlDir," +
  "` && (pkill -9 -U \\\"$(id -u)\\\" -f `," +
  "quote(`${cli}.*[d]esktop-ssh-websocket-v0.sock`)," +
  "` || true) && `,prepareAgent,` && : >`,logPath," +
  "`) && SSH_AUTH_SOCK=`,agentSocket,` nohup `,`spine-codex`," +
  "` -c features.code_mode_host=true`,` app-server --listen unix://`," +
  "` >${logPath} 2>&1 &`].join(``);";
const patchedRemoteBootstrap = hook.patchRemoteBootstrapCleanupSource(
  remoteBootstrapSource,
);
assert.match(
  patchedRemoteBootstrap,
  /fuser "\$control_socket"/,
);
assert.match(patchedRemoteBootstrap, /ps -o uid= -p "\$holder"/);
assert.match(patchedRemoteBootstrap, /"\$owner" != "\$current_uid"/);
assert.match(
  patchedRemoteBootstrap,
  /nohup sh -c 'exec "\$@" <\/dev\/null' sh/,
);
const renderedRemoteBootstrap = new Function(
  "cli",
  `${patchedRemoteBootstrap}; return command;`,
)("spine-codex");
assert.match(
  renderedRemoteBootstrap,
  /nohup sh -c 'exec "\$@" <\/dev\/null' sh spine-codex >\/tmp\/app-server\.log 2>&1 &/,
);
assert.doesNotMatch(renderedRemoteBootstrap, /&& nohup/);
assert.equal(
  spawnSync("/bin/sh", ["-n", "-c", renderedRemoteBootstrap]).status,
  0,
);
assert.match(patchedRemoteBootstrap, /app_server_pid=\$!/);
assert.match(patchedRemoteBootstrap, /net\.createConnection\(process\.argv\[1\]\)/);
assert.match(patchedRemoteBootstrap, /python3 -c 'import socket,sys/);
assert.match(patchedRemoteBootstrap, /attempt=0; while \[ "\$attempt" -lt 120 \]/);
assert.match(patchedRemoteBootstrap, /spine-codex-bootstrap\.lock/);
assert.match(patchedRemoteBootstrap, /if is_spine_server; then exit 0; fi/);
assert.match(patchedRemoteBootstrap, /ready_count=.*ready_count \+ 1/);
assert.match(patchedRemoteBootstrap, /Refusing to stop an app-server owned by another user/);
assert.match(
  patchedRemoteBootstrap,
  /\^\(node \/\[\^ \]\*\(spine-codex\|codex\)/,
);
assert.doesNotMatch(patchedRemoteBootstrap, /\[a\]pp-server --listen/);
assert.doesNotMatch(patchedRemoteBootstrap, /pkill -9 -U/);
const patchedForwardedAgentBootstrap =
  hook.patchRemoteBootstrapCleanupSource(forwardedAgentBootstrapSource);
const renderedForwardedAgentBootstrap = new Function(
  "cli",
  `${patchedForwardedAgentBootstrap}; return command;`,
)("spine-codex");
assert.match(
  renderedForwardedAgentBootstrap,
  /prepare-forwarded-agent && SSH_AUTH_SOCK=\/tmp\/forwarded-ssh-agent\.sock nohup sh -c/,
);
assert.match(
  renderedForwardedAgentBootstrap,
  /nohup sh -c 'exec "\$@" <\/dev\/null' sh spine-codex/,
);
assert.doesNotMatch(renderedForwardedAgentBootstrap, /pkill -9 -U/);
assert.equal(
  spawnSync("/bin/sh", ["-n", "-c", renderedForwardedAgentBootstrap]).status,
  0,
);
const patchedGroupedForwardedAgentBootstrap =
  hook.patchRemoteBootstrapCleanupSource(groupedForwardedAgentBootstrapSource);
const renderedGroupedForwardedAgentBootstrap = new Function(
  "cli",
  `${patchedGroupedForwardedAgentBootstrap}; return command;`,
)("spine-codex");
assert.match(
  renderedGroupedForwardedAgentBootstrap,
  /umask 077; mkdir -p "\$control_dir" \|\| exit \$\?;/,
);
assert.match(
  renderedGroupedForwardedAgentBootstrap,
  /prepare-forwarded-agent && SSH_AUTH_SOCK=\/tmp\/forwarded-ssh-agent\.sock nohup sh -c/,
);
assert.doesNotMatch(renderedGroupedForwardedAgentBootstrap, /pkill -9 -U/);
assert.equal(
  spawnSync("/bin/sh", ["-n", "-c", renderedGroupedForwardedAgentBootstrap])
    .status,
  0,
);
assert.throws(
  () => hook.patchRemoteBootstrapCleanupSource("const unrelated = true;"),
  /unsupported structure/,
);

assert.equal(hook.isMainBundleFilename("main-dcXtv3U5.js"), true);
assert.equal(hook.isMainBundleFilename("main--A7m_SpR.js"), true);
assert.equal(hook.isMainBundleFilename("main.js"), false);
assert.equal(hook.isMainBundleFilename("renderer-main-dcXtv3U5.js"), false);
assert.equal(hook.isSharedBundleFilename("src-Bn_6ASpg.js"), true);
assert.equal(hook.isSharedBundleFilename("src-CLstCQVF.js"), true);
assert.equal(hook.isSharedBundleFilename("renderer-src-Bn_6ASpg.js"), false);
assert.equal(
  hook.patchMainBundleCandidateSource(
    "/app/.vite/build/main-dcXtv3U5.js",
    "const unrelated = true;",
  ),
  null,
);
assert.equal(
  hook.patchMainBundleCandidateSource(
    "/app/.vite/build/renderer-dcXtv3U5.js",
    remoteSelectorSource,
  ),
  null,
);
for (const filename of ["main-dcXtv3U5.js", "main--A7m_SpR.js"]) {
  const candidate = hook.patchMainBundleCandidateSource(
    `/app/.vite/build/${filename}`,
    remoteSelectorSource + remoteBootstrapSource,
  );
  assert.match(candidate, /app-server-control\.sock/);
}

assert.match(wrapperSource, /REMOTE_CLI_NAME = "spine-codex"/);
assert.match(wrapperSource, /MIN_SPINE_CODEX_VERSION = "0\.2\.2"/);
assert.match(wrapperSource, /CODEX_CLI_PATH: REMOTE_CLI_NAME/);
assert.match(wrapperSource, /SPINE_CODEX_LOCAL_CLI_PATH: LOCAL_CLI_SHIM/);
assert.match(wrapperSource, /PATH: appSearchPath/);
assert.match(wrapperSource, /NODE_OPTIONS: mode === "adapter" \? "" : nodeOptions/);
assert.match(wrapperSource, /SPINE_CODEX_MIN_VERSION:/);
assert.match(wrapperSource, /SPINE_CODEX_MAIN_HOOK_STATUS:/);
assert.match(wrapperSource, /SPINE_CODEX_RENDERER_PATH:/);
assert.match(wrapperSource, /SPINE_CODEX_RENDERER_SHA256:/);
assert.match(wrapperSource, /SPINE_CODEX_LOCAL_IDENTITY_JSON/);
assert.match(wrapperSource, /prependRendererIdentity\(RENDERER_SOURCE, localIdentityJson\)/);
assert.match(
  wrapperSource,
  /createHash\("sha256"\)\s*\.update\(RENDERER_SOURCE\)\s*\.digest\("hex"\)/,
);
assert.match(wrapperSource, /SPINE_CODEX_SHIM_NODE: process\.execPath/);
assert.match(
  wrapperSource,
  /SPINE_CODEX_LOCAL_CLI_PATH: LOCAL_CLI_SHIM/,
);
assert.match(
  wrapperSource,
  /SPINE_CODEX_SHIM_NODE: process\.execPath/,
);
assert.match(
  mainHookReadinessSource,
  /rendererRecovery !== true/,
);
assert.match(
  wrapperSource,
  /waitForMainHookReady\(\s*mainHookStatusPath,\s*\{\s*timeoutMs: 20_000,\s*progressGraceMs: 10_000,\s*hardTimeoutMs: 30_000,\s*finalGraceMs: 500,/,
);
assert.match(wrapperSource, /--require \$\{JSON\.stringify\(ELECTRON_MAIN_HOOK\)\}/);
assert.match(wrapperSource, /--require "\$\{ELECTRON_MAIN_HOOK/);
assert.match(wrapperSource, /readElectronFuse/);
assert.match(wrapperSource, /NODE_OPTIONS_FUSE_INDEX = 2/);
assert.match(wrapperSource, /NODE_CLI_INSPECT_FUSE_INDEX = 3/);

assert.match(shimSource, /SPINE_CODEX_SHIM_NODE/);
assert.match(shimSource, /spine-codex\.mjs/);
assert.match(shimSource, /"\$@"/);

assert.equal(hook.isCodexMainSurfaceUrl("app://-/index.html"), true);
assert.equal(hook.isCodexMainSurfaceUrl("app://-/index.html#/thread/1"), true);
assert.equal(
  hook.isCodexMainSurfaceUrl(
    "app://-/index.html?initialRoute=%2Favatar-overlay",
  ),
  false,
);
assert.equal(
  hook.isCodexMainSurfaceUrl("app://-/index.html?initialRoute=%2Fthread"),
  true,
);
assert.equal(hook.isCodexMainSurfaceUrl("https://example.com/index.html"), false);
assert.equal(hook.isCodexMainSurfaceUrl("app://-/settings.html"), false);

function createFakeIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle(channel, handler) { handlers.set(channel, handler); },
    removeHandler(channel) { handlers.delete(channel); },
  };
}

const durabilityError =
  "Fatal error: Spine durability is faulted: Spine replay failed: " +
  "sampling commit does not match its sampling-started record";
const memoryOverflowError =
  "Fatal error: Spine context plan failed: " +
  "Spine memory fragment is 9005 bytes; maximum is 8000";
const wrappedMemoryOverflowError =
  "Fatal error: Spine durability is faulted: Spine context plan failed: " +
  "Spine memory fragment is 9005 bytes; maximum is 8000";
assert.equal(hook.isDurabilityReplayMismatch(durabilityError), true);
assert.equal(hook.isDurabilityReplayMismatch("different replay failure"), false);
assert.deepEqual(hook.parseSpineMemoryOverflow(memoryOverflowError), {
  fragmentBytes: 9005,
});
assert.deepEqual(hook.parseSpineMemoryOverflow(wrappedMemoryOverflowError), {
  fragmentBytes: 9005,
});
assert.equal(
  hook.parseSpineMemoryOverflow(
    "Spine context plan failed: Spine memory fragment is 8000 bytes; maximum is 8000",
  ),
  null,
);
assert.equal(
  hook.parseSpineMemoryOverflow(
    "Spine context plan failed: Spine node fragment is 9005 bytes; maximum is 8000",
  ),
  null,
);
assert.equal(hook.isRecoverableSpineFailure(durabilityError), true);
assert.equal(hook.isRecoverableSpineFailure(memoryOverflowError), true);
assert.equal(hook.isRecoverableSpineFailure(wrappedMemoryOverflowError), true);
assert.equal(hook.isRecoverableSpineFailure("different durability failure"), false);

const multibyteMemory = "界".repeat(2_986) + "ab";
assert.equal(Buffer.byteLength(multibyteMemory), 8_960);
const shortenedMemory = hook.truncateUtf8WithSuffix(multibyteMemory, 7_955, "\n[fixed]");
assert.equal(Buffer.byteLength(shortenedMemory) <= 7_955, true);
assert.equal(shortenedMemory.endsWith("\n[fixed]"), true);
assert.equal(shortenedMemory.includes("\uFFFD"), false);

const childThreadId = "00000000-0000-0000-0000-000000000041";
const parentThreadId = "00000000-0000-0000-0000-000000000042";
const recoveredThreadId = "00000000-0000-0000-0000-000000000043";
const replayFixture = await mkdtemp(join(tmpdir(), "spine-replay-history-test-"));
try {
  const archived = join(replayFixture, "archived_sessions");
  await mkdir(archived, { recursive: true });
  const childPath = join(archived, `rollout-child-${childThreadId}.jsonl`);
  const parentPath = join(archived, `rollout-parent-${parentThreadId}.jsonl`);
  const historyA = { type: "message", role: "user", content: [{ type: "input_text", text: "seed" }] };
  const historyB = { type: "message", role: "assistant", content: [{ type: "output_text", text: "tail" }] };
  const records = [
    {
      type: "session_meta",
      payload: {
        id: childThreadId,
        parent_thread_id: parentThreadId,
        thread_source: "subagent",
      },
    },
    { type: "response_item", payload: { type: "message", role: "user", content: [] } },
    { type: "compacted", payload: { replacement_history: [historyA] } },
    {
      type: "spine_sampling_started",
      payload: {
        payload: {
          record: {
            epoch: 0,
            previous_commit_id: null,
            attempt_id: { thread: parentThreadId },
          },
        },
      },
    },
    { type: "response_item", payload: historyB },
  ];
  await writeFile(childPath, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
  await writeFile(parentPath, JSON.stringify({
    type: "session_meta",
    payload: { id: parentThreadId },
  }) + "\n");

  const materialized = await hook.readInheritedReplayHistory(childPath, childThreadId);
  assert.deepEqual(materialized.history, [historyA, historyB]);
  assert.equal(materialized.parentThreadId, parentThreadId);
  const located = await hook.recoverInheritedReplayHistory(childThreadId, {
    codexHome: replayFixture,
  });
  assert.equal(located.rolloutPath, childPath);
  assert.equal(located.parentRolloutPath, parentPath);

  const invalidPath = join(archived, `rollout-invalid-${recoveredThreadId}.jsonl`);
  const invalidRecords = records.map((record) => JSON.parse(JSON.stringify(record)));
  invalidRecords[0].payload.id = recoveredThreadId;
  invalidRecords[3].payload.payload.record.attempt_id.thread = recoveredThreadId;
  await writeFile(
    invalidPath,
    invalidRecords.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );
  await assert.rejects(
    hook.readInheritedReplayHistory(invalidPath, recoveredThreadId),
    /mixed native-to-inherited lineage/,
  );

  const overflowThreadId = "00000000-0000-0000-0000-000000000044";
  const overflowPath = join(archived, `rollout-overflow-${overflowThreadId}.jsonl`);
  const overflowCallId = "call-overflow-close";
  const overflowArguments = JSON.stringify({ memory: multibyteMemory });
  const overflowRecords = [
    {
      type: "session_meta",
      payload: { id: overflowThreadId, thread_source: "user" },
    },
    { type: "response_item", payload: historyA },
    {
      type: "response_item",
      payload: {
        type: "function_call",
        name: "spine.close",
        arguments: overflowArguments,
        call_id: overflowCallId,
      },
    },
    {
      type: "response_item",
      payload: {
        type: "function_call_output",
        call_id: overflowCallId,
        output: "Spine close accepted.",
      },
    },
    {
      type: "event_msg",
      payload: {
        type: "task_complete",
        error: { message: memoryOverflowError },
      },
    },
  ];
  await writeFile(
    overflowPath,
    overflowRecords.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );
  const overflowRecovered = await hook.readMemoryOverflowReplayHistory(
    overflowPath,
    overflowThreadId,
    memoryOverflowError,
  );
  assert.equal(overflowRecovered.itemCount, 3);
  assert.equal(overflowRecovered.originalMemoryBytes, 8_960);
  assert.equal(overflowRecovered.repairedMemoryBytes <= 7_955, true);
  assert.equal(overflowRecovered.fragmentBytes, 9_005);
  const recoveredArguments = JSON.parse(overflowRecovered.history[1].arguments);
  assert.equal(Buffer.byteLength(recoveredArguments.memory) <= 7_955, true);
  assert.equal(recoveredArguments.memory.includes("\uFFFD"), false);
  assert.match(recoveredArguments.memory, /SpineCodex App: memory shortened/);
  assert.equal(
    JSON.parse(overflowArguments).memory,
    multibyteMemory,
    "the source transition remains unchanged",
  );
  const locatedOverflow = await hook.recoverMemoryOverflowReplayHistory(
    overflowThreadId,
    wrappedMemoryOverflowError,
    { codexHome: replayFixture },
  );
  assert.equal(locatedOverflow.rolloutPath, overflowPath);
  assert.equal(locatedOverflow.originalMemoryBytes, 8_960);

  const unacceptedPath = join(archived, `rollout-unaccepted-${overflowThreadId}.jsonl`);
  const unacceptedRecords = overflowRecords.map((record) => structuredClone(record));
  unacceptedRecords[3].payload.output = "Spine close rejected.";
  await writeFile(
    unacceptedPath,
    unacceptedRecords.map((record) => JSON.stringify(record)).join("\n") + "\n",
  );
  await assert.rejects(
    hook.readMemoryOverflowReplayHistory(
      unacceptedPath,
      overflowThreadId,
      memoryOverflowError,
    ),
    /accepted overflowing transition/,
  );

  const replayIpc = createFakeIpcMain();
  const observedMessages = [];
  const replayBridge = hook.installAppServerReplayRecovery({
    electron: { ipcMain: replayIpc },
    recoverHistory: async () => ({
      history: [historyA, historyB],
      itemCount: 2,
      parentThreadId,
    }),
    recoverMemoryOverflowHistory: async (_threadId, errorMessage) => {
      assert.equal(errorMessage, wrappedMemoryOverflowError);
      return {
        history: overflowRecovered.history,
        itemCount: overflowRecovered.itemCount,
      };
    },
  });
  replayIpc.handle("codex_desktop:message-from-view", async (_event, message) => {
    observedMessages.push(message);
  });
  assert.equal(replayBridge.ready, true);
  const appServerHandler = replayIpc.handlers.get("codex_desktop:message-from-view");
  await appServerHandler({}, {
    type: "mcp-request",
    request: {
      method: "initialize",
      params: { capabilities: { experimentalApi: true } },
    },
  });
  await appServerHandler({}, {
    type: "spine-thread-replay-aliases-sync",
    aliases: [[childThreadId, recoveredThreadId]],
  });
  await appServerHandler({}, {
    type: "mcp-request",
    request: { method: "thread/read", params: { threadId: childThreadId } },
  });
  assert.equal(observedMessages.at(-1).request.params.threadId, recoveredThreadId);
  await appServerHandler({}, {
    type: "spine-thread-replay-recover",
    hostId: "local",
    errorMessage: durabilityError,
    request: {
      jsonrpc: "2.0",
      id: "resume-1",
      method: "thread/resume",
      params: { threadId: childThreadId },
    },
  });
  assert.deepEqual(observedMessages.at(-1).request.params.history, [historyA, historyB]);
  assert.equal(observedMessages.at(-1).request.params.path, null);
  await appServerHandler({}, {
    type: "spine-thread-replay-recover",
    hostId: "local",
    errorMessage: wrappedMemoryOverflowError,
    request: {
      jsonrpc: "2.0",
      id: "resume-overflow",
      method: "thread/resume",
      params: { threadId: overflowThreadId },
    },
  });
  assert.equal(observedMessages.at(-1).request.params.path, null);
  assert.equal(observedMessages.at(-1).request.params.history.length, 3);
  await assert.rejects(
    appServerHandler({}, {
      type: "spine-thread-replay-recover",
      hostId: "local",
      errorMessage:
        "Fatal error: Spine context plan failed: " +
        "Spine memory fragment is 8000 bytes; maximum is 8000",
      request: {
        method: "thread/resume",
        params: { threadId: overflowThreadId },
      },
    }),
    /outside the guarded recovery scope/,
  );
  replayBridge.dispose();
  assert.notEqual(
    replayIpc.handlers.get("codex_desktop:message-from-view"),
    appServerHandler,
  );
} finally {
  await rm(replayFixture, { recursive: true, force: true });
}

const rendererSha256 = createHash("sha256").update(rendererSource).digest("hex");
const rendererPayload = hook.loadRendererPayload({
  rendererPath: fileURLToPath(rendererPath),
  rendererSha256,
  localIdentity: null,
});
assert.equal(rendererPayload.sha256, rendererSha256);
assert.equal(rendererPayload.source, rendererSource);
const identityPayload = hook.loadRendererPayload({
  rendererPath: fileURLToPath(rendererPath),
  rendererSha256,
  localIdentity: JSON.stringify({
    mode: "dual",
    productVersion: "0.3.3",
    compatibilityVersion: "0.147.0",
  }),
});
assert.equal(identityPayload.sha256, rendererSha256);
assert.match(identityPayload.source, /^Object\.defineProperty\(globalThis/);
assert.match(identityPayload.source, /__spineCodexLocalIdentityV1/);
assert.match(identityPayload.source, /"productVersion":"0\.3\.3"/);
assert.equal(identityPayload.source.endsWith(rendererSource), true);
assert.throws(
  () => hook.loadRendererPayload({
    rendererPath: fileURLToPath(rendererPath),
    rendererSha256: "0".repeat(64),
  }),
  /SHA-256 mismatch/,
);

class FakeWebContents extends EventEmitter {
  constructor(url, type = "window") {
    super();
    this.url = url;
    this.type = type;
    this.executions = [];
  }
  getURL() { return this.url; }
  getType() { return this.type; }
  isDestroyed() { return false; }
  isLoadingMainFrame() { return true; }
  async executeJavaScript(source, userGesture) {
    this.executions.push({ source, userGesture });
  }
}

const fakeApp = new EventEmitter();
fakeApp.whenReady = async () => {};
const existingContents = [];
const recoveryDirectory = await mkdtemp(join(tmpdir(), "spine-renderer-recovery-test-"));
const recoveryRenderer = join(recoveryDirectory, "spine-view.js");
const recoverySourceOne =
  '(function(){const GLOBAL_KEY = "__spineCodexViewV1";' +
  "const RENDERER_REVISION=1;globalThis[GLOBAL_KEY]={revision:RENDERER_REVISION};})();";
const recoverySourceTwo = recoverySourceOne.replace(
  "RENDERER_REVISION=1",
  "RENDERER_REVISION=2",
);
await writeFile(recoveryRenderer, recoverySourceOne);
const recoveryIdentityPayload = hook.loadRendererPayload({
  rendererPath: recoveryRenderer,
  rendererSha256: createHash("sha256").update(recoverySourceOne).digest("hex"),
  localIdentity: {
    mode: "dual",
    productVersion: "0.3.3",
    compatibilityVersion: "0.147.0",
  },
});
await writeFile(recoveryRenderer, recoverySourceTwo);
const reloadedIdentityPayload = hook.reloadRendererPayload(recoveryIdentityPayload);
assert.match(reloadedIdentityPayload.source, /__spineCodexLocalIdentityV1/);
assert.match(reloadedIdentityPayload.source, /"compatibilityVersion":"0\.147\.0"/);
assert.equal(reloadedIdentityPayload.source.endsWith(recoverySourceTwo), true);
await writeFile(recoveryRenderer, recoverySourceOne);
const recovery = hook.installRendererRecovery({
  payload: hook.loadRendererPayload({
    rendererPath: recoveryRenderer,
    rendererSha256: createHash("sha256").update(recoverySourceOne).digest("hex"),
  }),
  electron: {
    app: fakeApp,
    webContents: { getAllWebContents: () => existingContents },
  },
});
const mainSurface = new FakeWebContents("app://-/index.html#/thread/one");
fakeApp.emit("web-contents-created", {}, mainSurface);
mainSurface.emit("did-finish-load");
await new Promise((resolve) => setImmediate(resolve));
assert.equal(mainSurface.executions.length, 1);
assert.equal(mainSurface.executions[0].userGesture, false);
assert.equal(mainSurface.executions[0].source, recoverySourceOne);
// A renderer crash/reload uses the same webContents and emits another load.
await writeFile(recoveryRenderer, recoverySourceTwo);
mainSurface.emit("did-finish-load");
await new Promise((resolve) => setImmediate(resolve));
assert.equal(mainSurface.executions.length, 2);
assert.equal(mainSurface.executions[1].source, recoverySourceTwo);
assert.equal(
  recovery.payload.sha256,
  createHash("sha256").update(recoverySourceTwo).digest("hex"),
);
const avatarOverlay = new FakeWebContents(
  "app://-/index.html?initialRoute=%2Favatar-overlay",
);
fakeApp.emit("web-contents-created", {}, avatarOverlay);
avatarOverlay.emit("did-finish-load");
await new Promise((resolve) => setImmediate(resolve));
assert.equal(avatarOverlay.executions.length, 0);
const devtoolsSurface = new FakeWebContents("devtools://devtools/bundled/", "window");
fakeApp.emit("web-contents-created", {}, devtoolsSurface);
devtoolsSurface.emit("did-finish-load");
await new Promise((resolve) => setImmediate(resolve));
assert.equal(devtoolsSurface.executions.length, 0);
recovery.dispose();

const fixtureDirectory = await mkdtemp(join(tmpdir(), "spine-main-hook-test-"));
const fixtureMain = join(fixtureDirectory, "main-deferred.js");
const fixtureBridge = join(fixtureDirectory, "chunk-bridge.js");
const fixtureVersion = join(fixtureDirectory, "src-version.js");
const fixtureStatus = join(fixtureDirectory, "status.json");
const previousCodexCliPath = process.env.CODEX_CLI_PATH;
const previousLocalCliPath = process.env.SPINE_CODEX_LOCAL_CLI_PATH;
const previousMinimum = process.env.SPINE_CODEX_MIN_VERSION;
let deferredElectronReady = false;
const deferredIpcMain = createFakeIpcMain();
const deferredElectron = {
  app: Object.assign(new EventEmitter(), { whenReady: async () => {} }),
  webContents: { getAllWebContents: () => [] },
  ipcMain: deferredIpcMain,
};
try {
  await writeFile(
    fixtureVersion,
    localSelectorSource +
      "let official=`0.141.0`,prefix=`codex-app-server-version-unsupported:`,zero=`0.0.0`;" +
      "function compare(e,t){let a=e.split(`.`).map(Number),b=t.split(`.`).map(Number);" +
      "for(let i=0;i<3;i+=1){if(a[i]!==b[i])return a[i]-b[i]}return 0}" +
      "function check(e){return e===zero||compare(e,official)>=0}" +
      "module.exports={check,localCli:BB()};",
    "utf8",
  );
  await writeFile(
    fixtureBridge,
    "module.exports=require(`./src-version.js`);",
    "utf8",
  );
  await writeFile(
    fixtureMain,
    "let fallback=`codex`;" + remoteSelectorSource.replace("Aae", "fallback") +
      remoteBootstrapSource +
      "let version=require(`./chunk-bridge.js`);" +
      "module.exports={cli:$S(),check:version.check};",
    "utf8",
  );
  process.env.CODEX_CLI_PATH = "spine-codex";
  process.env.SPINE_CODEX_LOCAL_CLI_PATH =
    "/private/wrapper/bin/spine-codex";
  process.env.SPINE_CODEX_MIN_VERSION = "0.2.2";
  assert.equal(hook.installMainProcessHook({
    force: true,
    statusPath: fixtureStatus,
    deadlineMs: 2_000,
    rendererRecoveryOptions: {
      payload: Object.freeze({
        path: fileURLToPath(rendererPath),
        source: "globalThis.__spineRecoveryFixture = true;",
        sha256: rendererSha256,
      }),
      requireFn: (specifier) => {
        if (deferredElectronReady) return deferredElectron;
        const error = new Error(`Cannot find module '${specifier}'`);
        error.code = "MODULE_NOT_FOUND";
        throw error;
      },
    },
  }), true);
  deferredElectronReady = true;
  const earlyVersion = require(fixtureBridge);
  assert.equal(earlyVersion.check("0.2.2"), true);
  assert.equal(
    earlyVersion.localCli,
    "/private/wrapper/bin/spine-codex",
  );
  await new Promise((resolve) => setImmediate(resolve));
  deferredIpcMain.handle("codex_desktop:message-from-view", async () => {});
  const deferredMain = require(fixtureMain);
  assert.equal(deferredMain.cli, "spine-codex");
  assert.equal(deferredMain.check("0.2.2"), true);
  assert.equal(deferredMain.check("0.2.1"), false);
  const hookStatus = JSON.parse(await readFile(fixtureStatus, "utf8"));
  assert.equal(hookStatus.state, "ready");
  assert.equal(hookStatus.rendererRecovery, true);
  assert.equal(hookStatus.appServerReplayRecovery, true);
  assert.equal(hookStatus.rendererSha256, rendererSha256);
  assert.equal(hookStatus.mainFile, "main-deferred.js");
  assert.equal(hookStatus.versionFile, "src-version.js");
} finally {
  if (previousCodexCliPath == null) delete process.env.CODEX_CLI_PATH;
  else process.env.CODEX_CLI_PATH = previousCodexCliPath;
  if (previousLocalCliPath == null) {
    delete process.env.SPINE_CODEX_LOCAL_CLI_PATH;
  } else {
    process.env.SPINE_CODEX_LOCAL_CLI_PATH = previousLocalCliPath;
  }
  if (previousMinimum == null) delete process.env.SPINE_CODEX_MIN_VERSION;
  else process.env.SPINE_CODEX_MIN_VERSION = previousMinimum;
  await rm(fixtureDirectory, { recursive: true, force: true });
}

console.log(
  "Spine SSH command selection, local shim, and 0.2.2 main-process compatibility checks passed",
);
