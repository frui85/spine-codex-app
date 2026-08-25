"use strict";

const Module = require("node:module");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");
const { isMainThread } = require("node:worker_threads");

const DEFAULT_MIN_SPINE_VERSION = "0.2.2";
// Vite has emitted both `main--HASH.js` and `main-HASH.js` across Codex App
// releases. Treat every hashed main chunk as a candidate, then identify the
// real SSH-owning entrypoint by source structure instead of its filename.
const MAIN_BUNDLE_PATTERN = /^main-[A-Za-z0-9_-]+\.js$/;
const SHARED_BUNDLE_PATTERN = /^src-[A-Za-z0-9_-]+\.js$/;
const REMOTE_SOCKET_MARKER = "[d]esktop-ssh-websocket-v0.sock";
const VERSION_ERROR_MARKER = "codex-app-server-version-unsupported:";
const LOCAL_CLI_ERROR_MARKER =
  "Unable to locate the Codex CLI binary. Set CODEX_CLI_PATH or ensure the Electron resources include bin/codex.";
const DEFAULT_HOOK_DEADLINE_MS = 30_000;
const LOCAL_CLI_PATH_ENV = "SPINE_CODEX_LOCAL_CLI_PATH";
const LOCAL_IDENTITY_ENV = "SPINE_CODEX_LOCAL_IDENTITY_JSON";
const LOCAL_IDENTITY_GLOBAL = "__spineCodexLocalIdentityV1";
const RENDERER_PATH_ENV = "SPINE_CODEX_RENDERER_PATH";
const RENDERER_SHA256_ENV = "SPINE_CODEX_RENDERER_SHA256";
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ELECTRON_MAIN_SPECIFIERS = ["electron/main", "electron"];
const ELECTRON_MODULE_IDS = new Set(ELECTRON_MAIN_SPECIFIERS);
const APP_SERVER_VIEW_CHANNEL = "codex_desktop:message-from-view";
const REPLAY_RECOVERY_MESSAGE = "spine-thread-replay-recover";
const REPLAY_ALIAS_SYNC_MESSAGE = "spine-thread-replay-aliases-sync";
const THREAD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DURABILITY_REPLAY_MISMATCH_PATTERN =
  /Spine durability is faulted:\s*Spine replay failed:\s*sampling commit does not match its sampling-started record/;
const MAX_RECOVERY_HISTORY_ITEMS = 5_000;
const MAX_RECOVERY_HISTORY_BYTES = 64 * 1024 * 1024;
const VERSION_CHECK_PATTERN =
  /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{return \2===([A-Za-z_$][\w$]*)\|\|([A-Za-z_$][\w$]*)\(\2,([A-Za-z_$][\w$]*)\)>=0\}/g;
const STABLE_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\+[0-9A-Za-z.-]+)?$/;
const LOCAL_CLI_SELECTOR_PATTERN =
  /function ([A-Za-z_$][\w$]*)\(\)\{let ([A-Za-z_$][\w$]*)=process\.env\.CODEX_CLI_PATH;if\(\2==null\)return null;let ([A-Za-z_$][\w$]*)=\2\.trim\(\);return \3\.length===0\?null:\3\}/g;

function isMainBundleFilename(filename) {
  return MAIN_BUNDLE_PATTERN.test(path.basename(String(filename ?? "")));
}

function isSharedBundleFilename(filename) {
  return SHARED_BUNDLE_PATTERN.test(path.basename(String(filename ?? "")));
}

function remoteSocketProbeSource() {
  return [
    "probe_socket() { ",
    "if command -v node >/dev/null 2>&1; then ",
    "node -e 'const net=require(\"node:net\");",
    "const socket=net.createConnection(process.argv[1]);let done=false;",
    "const finish=code=>{if(done)return;done=true;socket.destroy();process.exit(code)};",
    "socket.once(\"connect\",()=>finish(0));socket.once(\"error\",()=>finish(1));",
    "setTimeout(()=>finish(1),250)' \"$control_socket\"; ",
    "elif command -v python3 >/dev/null 2>&1; then ",
    "python3 -c 'import socket,sys;s=socket.socket(socket.AF_UNIX);",
    "s.settimeout(.25);s.connect(sys.argv[1]);s.close()' \"$control_socket\"; ",
    "else [ -S \"$control_socket\" ] || return 1; sleep 1; fi; }; ",
  ].join("");
}

function remoteSpineIdentitySource() {
  return [
    "socket_holders() { command -v fuser >/dev/null 2>&1 || return 0; ",
    "fuser \"$control_socket\" 2>/dev/null || true; }; ",
    "is_spine_server() { probe_socket >/dev/null 2>&1 || return 1; ",
    "command -v fuser >/dev/null 2>&1 || return 1; ",
    "for holder in $(socket_holders); do ",
    "owner=$(ps -o uid= -p \"$holder\" | tr -d ' '); ",
    "[ \"$owner\" = \"$current_uid\" ] || continue; ",
    "current=$holder; depth=0; ",
    "while [ \"$current\" -gt 1 ] 2>/dev/null && [ \"$depth\" -lt 5 ]; do ",
    "cmdline=$(tr '\\\\0' ' ' < \"/proc/$current/cmdline\" 2>/dev/null || true); ",
    "case \"$cmdline\" in *spine-codex*) return 0;; esac; ",
    "current=$(grep '^PPid:' \"/proc/$current/status\" 2>/dev/null | tr -cd '0-9'); ",
    "[ -n \"$current\" ] || break; depth=$((depth + 1)); done; done; return 1; }; ",
  ].join("");
}

function remoteBootstrapPrefixSource({
  forwardedAgentSetupVariable = null,
  forwardedAgentSocketVariable = null,
  standalone = false,
} = {}) {
  const forwardedAgentSource =
    forwardedAgentSetupVariable != null &&
    forwardedAgentSocketVariable != null
      ? "`," + forwardedAgentSetupVariable +
        ",` && SSH_AUTH_SOCK=`," + forwardedAgentSocketVariable + ",` "
      : "";
  return [
    standalone ? "`" : "` || exit $?; ",
    "control_dir=\"\\${CODEX_HOME:-$HOME/.codex}/app-server-control\"; ",
    standalone ? "umask 077; mkdir -p \"$control_dir\" || exit $?; " : "",
    "control_socket=\"$control_dir/app-server-control.sock\"; ",
    "lock_dir=\"$control_dir/spine-codex-bootstrap.lock\"; current_uid=$(id -u); ",
    "lock_attempt=0; while ! mkdir \"$lock_dir\" 2>/dev/null; do ",
    "lock_pid=; if [ -r \"$lock_dir/pid\" ]; then read lock_pid < \"$lock_dir/pid\" || true; fi; ",
    "if [ -n \"$lock_pid\" ] && ! kill -0 \"$lock_pid\" 2>/dev/null; then ",
    "rm -f \"$lock_dir/pid\"; rmdir \"$lock_dir\" 2>/dev/null || true; continue; fi; ",
    "if [ \"$lock_attempt\" -ge 400 ]; then ",
    "echo 'SpineCodex remote bootstrap lock timed out' >&2; exit 1; fi; ",
    "lock_attempt=$((lock_attempt + 1)); sleep 0.1; done; ",
    "printf '%s\\n' \"$$\" > \"$lock_dir/pid\"; ",
    "release_lock() { rm -f \"$lock_dir/pid\"; rmdir \"$lock_dir\" 2>/dev/null || true; }; ",
    "trap release_lock 0; trap 'release_lock; exit 1' 1 2 15; ",
    remoteSocketProbeSource(),
    remoteSpineIdentitySource(),
    "if is_spine_server; then exit 0; fi; ",
    "holders=$(socket_holders); if ! command -v fuser >/dev/null 2>&1; then ",
    "holders=$(pgrep -U \"$current_uid\" -f ",
    "'^(node /[^ ]*(spine-codex|codex)[^ ]*|/[^ ]*(spine-codex|codex)[^ ]*) ",
    ".*app-server --listen unix://' || true); fi; ",
    "owned_holders=; for holder in $holders; do ",
    "owner=$(ps -o uid= -p \"$holder\" | tr -d ' '); ",
    "if [ -n \"$owner\" ] && [ \"$owner\" != \"$current_uid\" ]; then ",
    "echo 'Refusing to stop an app-server owned by another user' >&2; exit 1; fi; ",
    "[ \"$owner\" != \"$current_uid\" ] || owned_holders=\"$owned_holders $holder\"; done; ",
    "for holder in $owned_holders; do kill \"$holder\" 2>/dev/null || true; done; ",
    "stop_attempt=0; while [ \"$stop_attempt\" -lt 20 ]; do still_running=0; ",
    "for holder in $owned_holders; do kill -0 \"$holder\" 2>/dev/null && still_running=1; done; ",
    "[ \"$still_running\" -ne 0 ] || break; stop_attempt=$((stop_attempt + 1)); sleep 0.1; done; ",
    "for holder in $owned_holders; do ",
    "owner=$(ps -o uid= -p \"$holder\" | tr -d ' '); ",
    "[ \"$owner\" != \"$current_uid\" ] || kill -9 \"$holder\" 2>/dev/null || true; done; ",
    "[ ! -S \"$control_socket\" ] || rm -f \"$control_socket\"; ",
    forwardedAgentSource,
    "nohup sh -c 'exec \"$@\" </dev/null' sh `",
  ].join("");
}

function remoteBootstrapSuffixSource(logPathVariable) {
  const logPathExpression = "${" + logPathVariable + "}";
  return [
    ",` >",
    logPathExpression,
    " 2>&1 & app_server_pid=$!; ready_count=0; attempt=0; ",
    "while [ \"$attempt\" -lt 120 ]; do ",
    "if is_spine_server; then ready_count=$((ready_count + 1)); ",
    "[ \"$ready_count\" -lt 2 ] || exit 0; else ready_count=0; fi; ",
    "if ! kill -0 \"$app_server_pid\" 2>/dev/null; then ",
    "echo 'SpineCodex remote app-server exited before becoming ready' >&2; ",
    "tail -n 80 ",
    logPathExpression,
    " >&2 2>/dev/null || true; exit 1; fi; ",
    "attempt=$((attempt + 1)); sleep 0.1; done; ",
    "echo 'SpineCodex remote app-server readiness timed out' >&2; tail -n 80 ",
    logPathExpression,
    " >&2 2>/dev/null || true; exit 1`",
  ].join("");
}

function patchRemoteBootstrapCleanupSource(source) {
  const cleanupVariants = [
    {
      pattern:
        /` && \(pkill[^,]+`,[^,]+\(`\$\{[^}]+\}\.\*\[d\]esktop-ssh-websocket-v0\.sock`\),` \|\| true\) && nohup `/g,
      replacement: () => remoteBootstrapPrefixSource(),
    },
    {
      // Codex 26.803+ prepares a forwarded SSH-agent socket between stale
      // app-server cleanup and launch. Preserve both minified variables while
      // replacing only the unsafe process cleanup and readiness behavior.
      pattern:
        /` && \(pkill[^,]+`,[^,]+\(`\$\{[^}]+\}\.\*\[d\]esktop-ssh-websocket-v0\.sock`\),` \|\| true\) && `,([A-Za-z_$][\w$]*),` && SSH_AUTH_SOCK=`,([A-Za-z_$][\w$]*),` nohup `/g,
      replacement: (_, forwardedAgentSetupVariable, forwardedAgentSocketVariable) =>
        remoteBootstrapPrefixSource({
          forwardedAgentSetupVariable,
          forwardedAgentSocketVariable,
        }),
    },
    {
      // Codex 26.810+ groups directory creation, stale cleanup, forwarded-agent
      // setup, and log initialization before launch. Replace the complete
      // group so the injected shell does not inherit an unmatched subshell.
      pattern:
        /`\(umask 077; mkdir -p -- `,([A-Za-z_$][\w$]*),` && \(pkill[^,]+`,[^,]+\(`\$\{[^}]+\}\.\*\[d\]esktop-ssh-websocket-v0\.sock`\),` \|\| true\) && `,([A-Za-z_$][\w$]*),` && : >`,([A-Za-z_$][\w$]*),`\) && SSH_AUTH_SOCK=`,([A-Za-z_$][\w$]*),` nohup `/g,
      replacement: (
        _,
        _controlDirectoryVariable,
        forwardedAgentSetupVariable,
        _logPathVariable,
        forwardedAgentSocketVariable,
      ) =>
        remoteBootstrapPrefixSource({
          forwardedAgentSetupVariable,
          forwardedAgentSocketVariable,
          standalone: true,
        }),
    },
  ];
  const matches = cleanupVariants.flatMap(({ pattern, replacement }) =>
    Array.from(String(source).matchAll(pattern), (match) => ({
      match,
      pattern,
      replacement,
    })),
  );
  if (matches.length !== 1) {
    throw new Error("Codex SSH app-server cleanup has an unsupported structure");
  }
  const [{ pattern: cleanupPattern, replacement: cleanupReplacement }] = matches;
  let patched = String(source).replace(cleanupPattern, cleanupReplacement);

  const readinessPattern = /,` >\$\{([A-Za-z_$][\w$]*)\} 2>&1 &`/g;
  const readinessMatches = Array.from(patched.matchAll(readinessPattern));
  if (readinessMatches.length !== 1) {
    throw new Error("Codex SSH app-server readiness has an unsupported structure");
  }
  patched = patched.replace(readinessPattern, (_, logPathVariable) =>
    remoteBootstrapSuffixSource(logPathVariable),
  );
  return patched;
}

function patchLocalCliSelectorSource(source) {
  const input = String(source);
  if (!input.includes(LOCAL_CLI_ERROR_MARKER)) {
    throw new Error("Codex local CLI error marker was not found");
  }
  const matches = Array.from(input.matchAll(LOCAL_CLI_SELECTOR_PATTERN));
  if (matches.length !== 1) {
    throw new Error("Codex local CLI selector has an unsupported structure");
  }
  const [original, selectorName, rawName, trimmedName] = matches[0];
  const replacement =
    `function ${selectorName}(){let ${rawName}=` +
    `process.env.${LOCAL_CLI_PATH_ENV}??process.env.CODEX_CLI_PATH;` +
    `if(${rawName}==null)return null;let ${trimmedName}=${rawName}.trim();` +
    `return ${trimmedName}.length===0?null:${trimmedName}}`;
  return (
    input.slice(0, matches[0].index) +
    replacement +
    input.slice(matches[0].index + original.length)
  );
}

function patchMainBundleCandidateSource(filename, source) {
  if (
    !isMainBundleFilename(filename) ||
    !String(source).includes(REMOTE_SOCKET_MARKER)
  ) {
    return null;
  }
  // CODEX_CLI_PATH is deliberately the portable command name `spine-codex`,
  // so Codex's unmodified local and remote selectors already agree. The only
  // main-process patch needed here broadens cleanup of the one fixed Desktop
  // SSH socket: otherwise a server previously started by official `codex` can
  // survive and be silently reused before SpineCodex binds the same socket.
  return patchRemoteBootstrapCleanupSource(String(source));
}

function patchVersionCompatibilitySource(
  source,
  minimum = DEFAULT_MIN_SPINE_VERSION,
) {
  if (!parseVersion(minimum)) {
    throw new Error("SpineCodex minimum version is invalid");
  }
  const markerIndex = source.indexOf(VERSION_ERROR_MARKER);
  if (markerIndex < 0) {
    throw new Error("Codex app-server version marker was not found");
  }
  const searchStart = Math.max(0, markerIndex - 1_000);
  const searchEnd = Math.min(source.length, markerIndex + 6_000);
  const searchWindow = source.slice(searchStart, searchEnd);
  const matches = Array.from(searchWindow.matchAll(VERSION_CHECK_PATTERN));
  if (matches.length !== 1) {
    throw new Error("Codex app-server version check has an unsupported structure");
  }
  const [
    original,
    checkName,
    argumentName,
    zeroVersionName,
    compareName,
    officialMinimumName,
  ] = matches[0];
  const spineCompatible =
    `/${STABLE_VERSION_PATTERN.source}/.test(${argumentName})&&` +
    `${compareName}(${argumentName},${JSON.stringify(minimum)})>=0`;
  const replacement =
    `function ${checkName}(${argumentName}){return ` +
    `${argumentName}===${zeroVersionName}||` +
    `${compareName}(${argumentName},${officialMinimumName})>=0||` +
    `${spineCompatible}}`;
  const absoluteStart = searchStart + matches[0].index;
  const patched =
    source.slice(0, absoluteStart) +
    replacement +
    source.slice(absoluteStart + original.length);
  if (patched === source) {
    throw new Error("Codex app-server version check was not patched");
  }
  return patched;
}

function patchVersionBundleCandidateSource(
  filename,
  source,
  minimum = DEFAULT_MIN_SPINE_VERSION,
) {
  if (
    !isSharedBundleFilename(filename) ||
    !String(source).includes(VERSION_ERROR_MARKER)
  ) {
    return null;
  }
  const localCliPatched = patchLocalCliSelectorSource(String(source));
  return patchVersionCompatibilitySource(localCliPatched, minimum);
}

function parseVersion(value) {
  const match = String(value ?? "")
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:\+[0-9A-Za-z.-]+)?$/);
  return match ? match.slice(1, 4).map(Number) : null;
}

function versionAtLeast(value, minimum) {
  const candidate = parseVersion(value);
  const floor = parseVersion(minimum);
  if (!candidate || !floor) return false;
  for (let index = 0; index < 3; index += 1) {
    if (candidate[index] !== floor[index]) {
      return candidate[index] > floor[index];
    }
  }
  return true;
}

function writeHookStatus(statusPath, state, details = {}) {
  if (!statusPath || !path.isAbsolute(statusPath)) return;
  const temporary = `${statusPath}.${process.pid}.tmp`;
  const payload = JSON.stringify({
    state,
    pid: process.pid,
    timestamp: new Date().toISOString(),
    ...details,
  });
  try {
    fs.writeFileSync(temporary, payload, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, statusPath);
  } catch {
    try { fs.unlinkSync(temporary); } catch {}
  }
}

function isCodexMainSurfaceUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return (
      url.protocol === "app:" &&
      url.hostname === "-" &&
      url.pathname === "/index.html" &&
      url.searchParams.get("initialRoute") !== "/avatar-overlay"
    );
  } catch {
    return false;
  }
}

function isDirectModuleMissing(error, specifier) {
  if (error?.code !== "MODULE_NOT_FOUND") return false;
  const firstLine = String(error?.message ?? "").split("\n", 1)[0];
  return (
    firstLine.includes(`'${specifier}'`) ||
    firstLine.includes(`"${specifier}"`)
  );
}

function loadElectronMainApi(requireFn = require) {
  const unavailable = [];
  for (const specifier of ELECTRON_MAIN_SPECIFIERS) {
    try {
      return requireFn(specifier);
    } catch (error) {
      if (!isDirectModuleMissing(error, specifier)) throw error;
      unavailable.push(error);
    }
  }
  const error = new Error(
    "Electron main API is not available during the Node preload phase",
  );
  error.code = "SPINE_ELECTRON_API_UNAVAILABLE";
  error.cause = unavailable.at(-1);
  throw error;
}

function loadRendererPayload(options = {}) {
  const rendererPath = options.rendererPath ?? process.env[RENDERER_PATH_ENV];
  const expectedSha256 = String(
    options.rendererSha256 ?? process.env[RENDERER_SHA256_ENV] ?? "",
  ).toLowerCase();
  if (!rendererPath && !expectedSha256) return null;
  if (!rendererPath || !path.isAbsolute(rendererPath)) {
    throw new Error("SpineCodex renderer path must be absolute");
  }
  if (!SHA256_PATTERN.test(expectedSha256)) {
    throw new Error("SpineCodex renderer SHA-256 is missing or invalid");
  }
  const source = fs.readFileSync(rendererPath, "utf8");
  const actualSha256 = crypto.createHash("sha256").update(source).digest("hex");
  if (actualSha256 !== expectedSha256) {
    throw new Error("SpineCodex renderer SHA-256 mismatch");
  }
  const identityValue = Object.hasOwn(options, "localIdentity")
    ? options.localIdentity
    : process.env[LOCAL_IDENTITY_ENV];
  const identityPrelude = rendererIdentityPrelude(identityValue);
  return Object.freeze({
    path: path.resolve(rendererPath),
    source: identityPrelude + source,
    sha256: actualSha256,
    identityPrelude,
  });
}

function normalizeRendererIdentity(value) {
  let identity = value;
  if (typeof identity === "string") {
    try {
      identity = JSON.parse(identity);
    } catch {
      return null;
    }
  }
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) {
    return null;
  }
  const productVersion = parseVersion(identity.productVersion)
    ? String(identity.productVersion)
    : null;
  const compatibilityVersion = parseVersion(identity.compatibilityVersion)
    ? String(identity.compatibilityVersion)
    : null;
  if (!productVersion && !compatibilityVersion) return null;
  const mode = ["dual", "legacy", "compatibility-only"].includes(identity.mode)
    ? identity.mode
    : "compatibility-only";
  return { mode, productVersion, compatibilityVersion };
}

function rendererIdentityPrelude(value) {
  const identity = normalizeRendererIdentity(value);
  if (!identity) return "";
  return (
    `Object.defineProperty(globalThis, ${JSON.stringify(LOCAL_IDENTITY_GLOBAL)}, {` +
    `value: Object.freeze(${JSON.stringify(identity)}), configurable: true});\n`
  );
}

function reloadRendererPayload(payload) {
  if (!payload?.path || !path.isAbsolute(payload.path)) {
    throw new Error("SpineCodex renderer recovery path is unavailable");
  }
  const source = fs.readFileSync(payload.path, "utf8");
  if (
    !source.includes('const GLOBAL_KEY = "__spineCodexViewV1"') ||
    !source.includes("RENDERER_REVISION")
  ) {
    throw new Error("SpineCodex renderer source has an unsupported structure");
  }
  const sha256 = crypto.createHash("sha256").update(source).digest("hex");
  if (sha256 === payload.sha256) return payload;
  return Object.freeze({
    path: payload.path,
    source: (payload.identityPrelude ?? "") + source,
    sha256,
    identityPrelude: payload.identityPrelude ?? "",
  });
}

function isDurabilityReplayMismatch(value) {
  return DURABILITY_REPLAY_MISMATCH_PATTERN.test(String(value ?? ""));
}

function isThreadId(value) {
  return THREAD_ID_PATTERN.test(String(value ?? ""));
}

async function findThreadRolloutPath(threadId, options = {}) {
  if (!isThreadId(threadId)) {
    throw new Error("Spine replay recovery requires a valid thread ID");
  }
  const codexHome = path.resolve(
    options.codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), ".codex"),
  );
  const roots = [
    path.join(codexHome, "sessions"),
    path.join(codexHome, "archived_sessions"),
  ];
  const suffix = `-${threadId}.jsonl`;
  const matches = [];
  const pending = [...roots];
  while (pending.length) {
    const directory = pending.pop();
    let entries;
    try {
      entries = await fs.promises.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(candidate);
      else if (entry.isFile() && entry.name.endsWith(suffix)) matches.push(candidate);
    }
  }
  if (matches.length === 0) {
    throw new Error(`Spine replay recovery could not locate thread ${threadId}`);
  }
  const ranked = await Promise.all(matches.map(async (candidate) => ({
    candidate,
    modified: (await fs.promises.stat(candidate)).mtimeMs,
  })));
  ranked.sort((left, right) => right.modified - left.modified);
  return ranked[0].candidate;
}

function inheritedSpineThread(record) {
  return record?.attempt_id?.thread ?? record?.pre_boundary?.thread ?? null;
}

async function readInheritedReplayHistory(rolloutPath, threadId) {
  const stream = fs.createReadStream(rolloutPath, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let lineNumber = 0;
  let firstSessionMeta = null;
  let firstSpineRecord = null;
  let compactedBeforeFirstSpine = false;
  let history = [];
  let hasReplacementHistory = false;
  let unsupportedTailReason = null;

  try {
    for await (const line of lines) {
      lineNumber += 1;
      if (!line.trim()) continue;
      let item;
      try {
        item = JSON.parse(line);
      } catch {
        throw new Error(`Spine replay recovery found malformed JSONL at line ${lineNumber}`);
      }
      if (item.type === "session_meta" && firstSessionMeta == null) {
        firstSessionMeta = item.payload;
        continue;
      }
      if (item.type === "spine_sampling_started" && firstSpineRecord == null) {
        firstSpineRecord = item.payload?.payload?.record ?? null;
        continue;
      }
      if (item.type === "compacted") {
        if (firstSpineRecord == null) compactedBeforeFirstSpine = true;
        if (!Array.isArray(item.payload?.replacement_history)) {
          throw new Error(
            "Spine replay recovery cannot safely materialize a legacy compact without replacement history",
          );
        }
        history = item.payload.replacement_history;
        hasReplacementHistory = true;
        unsupportedTailReason = null;
        continue;
      }
      if (item.type === "response_item") {
        history.push(item.payload);
        continue;
      }
      if (item.type === "inter_agent_communication") {
        unsupportedTailReason = "inter-agent communication after the latest compact";
        continue;
      }
      if (
        item.type === "event_msg" &&
        item.payload?.type === "thread_rolled_back"
      ) {
        unsupportedTailReason = "a rollback after the latest compact";
      }
    }
  } finally {
    lines.close();
    stream.destroy();
  }

  if (firstSessionMeta?.id !== threadId) {
    throw new Error("Spine replay recovery rollout identity does not match the requested thread");
  }
  const parentThreadId = firstSessionMeta.parent_thread_id;
  const isSubagent =
    firstSessionMeta.thread_source === "subagent" ||
    firstSessionMeta.source?.subagent != null;
  if (!isSubagent || !isThreadId(parentThreadId)) {
    throw new Error("Spine replay recovery is limited to inherited subagent lineages");
  }
  const recordThread = inheritedSpineThread(firstSpineRecord);
  if (
    !compactedBeforeFirstSpine ||
    firstSpineRecord?.epoch !== 0 ||
    firstSpineRecord?.previous_commit_id != null ||
    recordThread !== parentThreadId ||
    recordThread === threadId
  ) {
    throw new Error("Spine replay recovery did not find a mixed native-to-inherited lineage");
  }
  if (!hasReplacementHistory || history.length === 0) {
    throw new Error("Spine replay recovery found no effective native history");
  }
  if (unsupportedTailReason != null) {
    throw new Error(`Spine replay recovery cannot safely handle ${unsupportedTailReason}`);
  }
  if (history.length > MAX_RECOVERY_HISTORY_ITEMS) {
    throw new Error("Spine replay recovery history exceeds the item safety limit");
  }
  const historyBytes = Buffer.byteLength(JSON.stringify(history));
  if (historyBytes > MAX_RECOVERY_HISTORY_BYTES) {
    throw new Error("Spine replay recovery history exceeds the byte safety limit");
  }
  return Object.freeze({
    history,
    parentThreadId,
    itemCount: history.length,
    historyBytes,
  });
}

async function recoverInheritedReplayHistory(threadId, options = {}) {
  const rolloutPath = await findThreadRolloutPath(threadId, options);
  const recovered = await readInheritedReplayHistory(rolloutPath, threadId);
  const parentRolloutPath = await findThreadRolloutPath(
    recovered.parentThreadId,
    options,
  );
  return Object.freeze({ ...recovered, rolloutPath, parentRolloutPath });
}

function installAppServerReplayRecovery(options = {}) {
  const electron = options.electron ?? loadElectronMainApi(options.requireFn);
  const ipcMain = electron?.ipcMain;
  if (typeof ipcMain?.handle !== "function") {
    throw new Error("Electron App Server recovery IPC APIs are unavailable");
  }
  const channel = options.channel ?? APP_SERVER_VIEW_CHANNEL;
  const recoverHistory = options.recoverHistory ?? recoverInheritedReplayHistory;
  const aliases = new Map();
  const originalHandle = ipcMain.handle;
  let disposed = false;
  let ready = false;
  let registeredHandler = null;
  let experimentalApiEnabled = false;

  const applyAliases = (entries) => {
    if (!Array.isArray(entries)) return;
    aliases.clear();
    for (const entry of entries) {
      const [source, target] = Array.isArray(entry) ? entry : [];
      if (isThreadId(source) && isThreadId(target) && source !== target) {
        aliases.set(source, target);
      }
    }
  };

  const wrapHandler = (handler) => async (event, message) => {
    if (message?.type === REPLAY_ALIAS_SYNC_MESSAGE) {
      applyAliases(message.aliases);
      return;
    }
    if (message?.type === REPLAY_RECOVERY_MESSAGE) {
      const request = message.request;
      const threadId = request?.params?.threadId;
      if (
        message.hostId !== "local" ||
        request?.method !== "thread/resume" ||
        request.params?.history != null ||
        !experimentalApiEnabled ||
        !isThreadId(threadId) ||
        !isDurabilityReplayMismatch(message.errorMessage)
      ) {
        throw new Error("Spine replay recovery request is outside the guarded recovery scope");
      }
      const recovered = await recoverHistory(threadId, options);
      const retry = {
        ...message,
        type: "mcp-request",
        request: {
          ...request,
          params: {
            ...request.params,
            history: recovered.history,
            path: null,
          },
        },
      };
      delete retry.errorMessage;
      console.warn(
        `[SpineCodex] retrying inherited Spine lineage ${threadId} with ` +
          `${recovered.itemCount} effective native history items`,
      );
      return handler(event, retry);
    }
    if (message?.type === "mcp-request") {
      if (message.request?.method === "initialize") {
        experimentalApiEnabled =
          message.request.params?.capabilities?.experimentalApi === true;
      }
      const threadId = message.request?.params?.threadId;
      const target = aliases.get(threadId);
      if (target != null) {
        message = {
          ...message,
          request: {
            ...message.request,
            params: { ...message.request.params, threadId: target },
          },
        };
      }
    }
    return handler(event, message);
  };

  function spineIpcHandle(requestChannel, handler) {
    if (requestChannel !== channel) {
      return Reflect.apply(originalHandle, this, [requestChannel, handler]);
    }
    const result = Reflect.apply(originalHandle, this, [requestChannel, wrapHandler(handler)]);
    registeredHandler = handler;
    ready = true;
    if (ipcMain.handle === spineIpcHandle) ipcMain.handle = originalHandle;
    options.onReady?.();
    return result;
  }

  ipcMain.handle = spineIpcHandle;
  return Object.freeze({
    get ready() { return ready; },
    aliases,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (ipcMain.handle === spineIpcHandle) ipcMain.handle = originalHandle;
      if (
        ready &&
        registeredHandler != null &&
        typeof ipcMain.removeHandler === "function"
      ) {
        ipcMain.removeHandler(channel);
        Reflect.apply(originalHandle, ipcMain, [channel, registeredHandler]);
      }
    },
  });
}

function isElectronMainApi(value) {
  return Boolean(
    value?.app?.on &&
    value?.app?.whenReady &&
    value?.webContents?.getAllWebContents &&
    value?.ipcMain?.handle,
  );
}

function captureElectronMainApi(options = {}) {
  const moduleApi = options.moduleApi ?? Module;
  const loadInitial = options.loadInitial ?? (() => loadElectronMainApi());
  const onReady = options.onReady;
  if (typeof onReady !== "function") {
    throw new TypeError("Electron main API capture requires an onReady callback");
  }

  try {
    const immediate = loadInitial();
    if (!isElectronMainApi(immediate)) {
      throw new Error("Electron main-process APIs are unavailable");
    }
    onReady(immediate);
    return Object.freeze({ deferred: false, dispose() {} });
  } catch (error) {
    if (error?.code !== "SPINE_ELECTRON_API_UNAVAILABLE") throw error;
  }

  const originalLoad = moduleApi._load;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    if (moduleApi._load === spineElectronLoad) moduleApi._load = originalLoad;
  };
  function spineElectronLoad(request, parent, isMain) {
    const value = Reflect.apply(originalLoad, this, [request, parent, isMain]);
    if (ELECTRON_MODULE_IDS.has(request) && isElectronMainApi(value)) {
      dispose();
      onReady(value);
    }
    return value;
  }
  moduleApi._load = spineElectronLoad;
  return Object.freeze({ deferred: true, dispose });
}

function installRendererRecovery(options = {}) {
  let payload = options.payload ?? loadRendererPayload(options);
  if (payload == null) return null;
  const electron = options.electron ?? loadElectronMainApi(options.requireFn);
  const app = electron?.app;
  const webContents = electron?.webContents;
  if (!app?.on || !app?.whenReady || !webContents?.getAllWebContents) {
    throw new Error("Electron renderer recovery APIs are unavailable");
  }

  const attached = new WeakSet();
  const inFlight = new WeakMap();
  let disposed = false;

  const isMainSurface = (contents) => {
    if (!contents || contents.isDestroyed?.()) return false;
    if (typeof contents.getType === "function" && contents.getType() !== "window") {
      return false;
    }
    return isCodexMainSurfaceUrl(contents.getURL?.());
  };

  const inject = (contents, reason = "did-finish-load") => {
    if (disposed || !isMainSurface(contents)) return Promise.resolve(false);
    const active = inFlight.get(contents);
    if (active) return active;
    const pending = Promise.resolve()
      // A long-running Electron main process can outlive several renderer
      // revisions. Re-read the already-validated absolute resource path at
      // each main-surface load so a renderer crash never revives the source
      // that happened to be in memory when the App first started.
      .then(() => {
        payload = (options.reloadPayload ?? reloadRendererPayload)(payload);
        return contents.executeJavaScript(payload.source, false);
      })
      .then(() => true)
      .catch((error) => {
        console.error(
          `[SpineCodex] renderer recovery failed (${reason}):`,
          error?.stack ?? error,
        );
        return false;
      })
      .finally(() => {
        if (inFlight.get(contents) === pending) inFlight.delete(contents);
      });
    inFlight.set(contents, pending);
    return pending;
  };

  const attach = (contents) => {
    if (disposed || !contents?.on || attached.has(contents)) return false;
    attached.add(contents);
    contents.on("did-finish-load", () => { void inject(contents); });
    // This covers a hook installed after an already-loaded main surface while
    // remaining a one-shot event-driven check. Normal startup is handled by
    // did-finish-load, and renderer crash reloads emit it again.
    if (contents.isLoadingMainFrame?.() === false) {
      setImmediate(() => { void inject(contents, "existing-surface"); });
    }
    return true;
  };

  const onWebContentsCreated = (_event, contents) => { attach(contents); };
  app.on("web-contents-created", onWebContentsCreated);
  void app.whenReady().then(() => {
    if (disposed) return;
    for (const contents of webContents.getAllWebContents()) attach(contents);
  });

  return Object.freeze({
    get payload() { return payload; },
    attach,
    inject,
    dispose() {
      if (disposed) return;
      disposed = true;
      app.removeListener?.("web-contents-created", onWebContentsCreated);
    },
  });
}

function installMainProcessHook(options = {}) {
  if (
    options.force !== true &&
    (!isMainThread || !process.versions?.electron || process.type !== "browser")
  ) return false;
  const minimum =
    process.env.SPINE_CODEX_MIN_VERSION || DEFAULT_MIN_SPINE_VERSION;
  if (!parseVersion(minimum)) return false;
  const statusPath =
    options.statusPath ?? process.env.SPINE_CODEX_MAIN_HOOK_STATUS;
  const deadlineMs = options.deadlineMs ?? DEFAULT_HOOK_DEADLINE_MS;

  const originalExtension = Module._extensions[".js"];
  let patchedMainFilename = null;
  let patchedVersionFilename = null;
  let mainPatched = false;
  let versionPatched = false;
  let rendererRecovery = null;
  let appServerReplayRecovery = null;
  let electronCapture = null;
  let rendererRecoveryDeferred = false;
  let deadline = null;
  let failed = false;

  const restoreExtension = () => {
    if (Module._extensions[".js"] === spineCodexMainExtension) {
      Module._extensions[".js"] = originalExtension;
    }
  };
  const incompatible = (reason) => {
    if (failed) return;
    failed = true;
    restoreExtension();
    electronCapture?.dispose();
    appServerReplayRecovery?.dispose();
    if (deadline != null) clearTimeout(deadline);
    writeHookStatus(statusPath, "incompatible", {
      reason: String(reason?.message ?? reason),
      mainPatched,
      versionPatched,
      rendererRecovery: rendererRecovery != null,
      appServerReplayRecovery: appServerReplayRecovery?.ready === true,
    });
  };
  const completeIfReady = () => {
    if (
      failed ||
      !mainPatched ||
      !versionPatched ||
      rendererRecovery == null ||
      appServerReplayRecovery?.ready !== true
    ) {
      return false;
    }
    restoreExtension();
    electronCapture?.dispose();
    if (deadline != null) clearTimeout(deadline);
    writeHookStatus(statusPath, "ready", {
      mainFile: path.basename(patchedMainFilename),
      versionFile: path.basename(patchedVersionFilename),
      minimum,
      rendererRecovery: rendererRecovery != null,
      appServerReplayRecovery: true,
      rendererSha256: rendererRecovery?.payload.sha256 ?? null,
    });
    return true;
  };
  const activateElectronIntegrations = (electron) => {
    if (rendererRecovery != null || appServerReplayRecovery != null) {
      return { rendererRecovery, appServerReplayRecovery };
    }
    try {
      rendererRecovery = installRendererRecovery({
        ...options.rendererRecoveryOptions,
        electron,
      });
      appServerReplayRecovery = installAppServerReplayRecovery({
        ...options.appServerReplayRecoveryOptions,
        electron,
        onReady: completeIfReady,
      });
    } catch (error) {
      incompatible(error);
      throw error;
    }
    if (!completeIfReady()) {
      writeHookStatus(statusPath, "electron-integrations-installed", {
        mainPatched,
        versionPatched,
        rendererRecovery: true,
        appServerReplayRecovery: appServerReplayRecovery?.ready === true,
      });
    }
    return { rendererRecovery, appServerReplayRecovery };
  };

  try {
    const explicitElectron = options.rendererRecoveryOptions?.electron;
    if (explicitElectron != null) {
      activateElectronIntegrations(explicitElectron);
    } else {
      const loadInitial = () => loadElectronMainApi(
        options.rendererRecoveryOptions?.requireFn,
      );
      electronCapture = captureElectronMainApi({
        ...options.electronCaptureOptions,
        loadInitial,
        onReady: activateElectronIntegrations,
      });
      rendererRecoveryDeferred = electronCapture.deferred;
    }
  } catch (error) {
    incompatible(error);
    throw error;
  }

  function spineCodexMainExtension(
    module,
    filename,
  ) {
    if (isMainBundleFilename(filename)) {
      const source = fs.readFileSync(filename, "utf8");
      let patched;
      try {
        patched = patchMainBundleCandidateSource(filename, source);
      } catch (error) {
        incompatible(error);
        throw error;
      }
      if (patched == null) {
        // This is another Vite main chunk, not the SSH-owning entrypoint. Keep
        // the hook installed until the structurally identified target loads.
        return module._compile(source, filename);
      }
      patchedMainFilename = path.resolve(filename);
      mainPatched = true;
      if (!completeIfReady()) {
        writeHookStatus(statusPath, "main-patched", {
          mainFile: path.basename(filename),
          versionPatched,
        });
      }
      // Keep the extension hook for the target main bundle's direct src-* load.
      return module._compile(patched, filename);
    }

    if (isSharedBundleFilename(filename)) {
      const source = fs.readFileSync(filename, "utf8");
      let patched;
      try {
        patched = patchVersionBundleCandidateSource(
          filename,
          source,
          minimum,
        );
      } catch (error) {
        incompatible(error);
        throw error;
      }
      if (patched != null) {
        versionPatched = true;
        patchedVersionFilename = path.resolve(filename);
        if (!completeIfReady()) {
          writeHookStatus(statusPath, "version-patched", {
            versionFile: path.basename(filename),
            mainPatched,
          });
        }
        return module._compile(patched, filename);
      }
      // Shared chunks can load before the SSH-owning main entrypoint or through
      // intermediate chunks. Compile unrelated candidates unchanged and wait
      // independently for both structurally identified targets.
      return module._compile(source, filename);
    }

    return Reflect.apply(originalExtension, this, [module, filename]);
  }

  Module._extensions[".js"] = spineCodexMainExtension;
  writeHookStatus(statusPath, "installed", {
    minimum,
    rendererRecovery: rendererRecovery != null,
    rendererRecoveryDeferred,
  });
  if (rendererRecoveryDeferred) {
    setImmediate(() => {
      if (failed || rendererRecovery != null) return;
      try {
        const electron = loadElectronMainApi(
          options.rendererRecoveryOptions?.requireFn,
        );
        electronCapture?.dispose();
        activateElectronIntegrations(electron);
      } catch (error) {
        if (error?.code !== "SPINE_ELECTRON_API_UNAVAILABLE") incompatible(error);
      }
    });
  }
  deadline = setTimeout(() => {
    if (
      !mainPatched ||
      !versionPatched ||
      rendererRecovery == null ||
      appServerReplayRecovery?.ready !== true
    ) {
      incompatible(
        "SpineCodex hook did not observe compatible Codex bundles, Electron APIs, and replay bridge before its deadline",
      );
    }
  }, deadlineMs);
  deadline.unref?.();
  return true;
}

module.exports = {
  DEFAULT_MIN_SPINE_VERSION,
  parseVersion,
  versionAtLeast,
  isMainBundleFilename,
  isSharedBundleFilename,
  patchRemoteBootstrapCleanupSource,
  patchMainBundleCandidateSource,
  patchLocalCliSelectorSource,
  patchVersionCompatibilitySource,
  patchVersionBundleCandidateSource,
  normalizeRendererIdentity,
  rendererIdentityPrelude,
  writeHookStatus,
  isCodexMainSurfaceUrl,
  loadRendererPayload,
  reloadRendererPayload,
  loadElectronMainApi,
  isDurabilityReplayMismatch,
  findThreadRolloutPath,
  readInheritedReplayHistory,
  recoverInheritedReplayHistory,
  installAppServerReplayRecovery,
  isElectronMainApi,
  captureElectronMainApi,
  installRendererRecovery,
  installMainProcessHook,
};

installMainProcessHook();
