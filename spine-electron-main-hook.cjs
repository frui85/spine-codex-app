"use strict";

const Module = require("node:module");
const fs = require("node:fs");
const path = require("node:path");
const { isMainThread } = require("node:worker_threads");

const DEFAULT_MIN_SPINE_VERSION = "0.2.2";
// Vite has emitted both `main--HASH.js` and `main-HASH.js` across Codex App
// releases. Treat every hashed main chunk as a candidate, then identify the
// real SSH-owning entrypoint by source structure instead of its filename.
const MAIN_BUNDLE_PATTERN = /^main-[A-Za-z0-9_-]+\.js$/;
const SHARED_BUNDLE_PATTERN = /^src-[A-Za-z0-9_-]+\.js$/;
const REMOTE_SOCKET_MARKER = "[d]esktop-ssh-websocket-v0.sock";
const VERSION_ERROR_MARKER = "codex-app-server-version-unsupported:";
const DEFAULT_HOOK_DEADLINE_MS = 30_000;
const VERSION_CHECK_PATTERN =
  /function ([A-Za-z_$][\w$]*)\(([A-Za-z_$][\w$]*)\)\{return \2===([A-Za-z_$][\w$]*)\|\|([A-Za-z_$][\w$]*)\(\2,([A-Za-z_$][\w$]*)\)>=0\}/g;
const STABLE_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\+[0-9A-Za-z.-]+)?$/;

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

function remoteBootstrapPrefixSource() {
  return [
    "` || exit $?; ",
    "control_dir=\"\\${CODEX_HOME:-$HOME/.codex}/app-server-control\"; ",
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
  const cleanupPattern =
    /` && \(pkill[^,]+`,[^,]+\(`\$\{[^}]+\}\.\*\[d\]esktop-ssh-websocket-v0\.sock`\),` \|\| true\) && nohup `/g;
  const cleanupMatches = Array.from(String(source).matchAll(cleanupPattern));
  if (cleanupMatches.length !== 1) {
    throw new Error("Codex SSH app-server cleanup has an unsupported structure");
  }
  let patched = String(source).replace(
    cleanupPattern,
    () => remoteBootstrapPrefixSource(),
  );

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
  return patchVersionCompatibilitySource(String(source), minimum);
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
  let deadline = null;

  const restoreExtension = () => {
    if (Module._extensions[".js"] === spineCodexMainExtension) {
      Module._extensions[".js"] = originalExtension;
    }
  };
  const incompatible = (reason) => {
    restoreExtension();
    if (deadline != null) clearTimeout(deadline);
    writeHookStatus(statusPath, "incompatible", {
      reason: String(reason?.message ?? reason),
      mainPatched,
      versionPatched,
    });
  };
  const completeIfReady = () => {
    if (!mainPatched || !versionPatched) return false;
    restoreExtension();
    if (deadline != null) clearTimeout(deadline);
    writeHookStatus(statusPath, "ready", {
      mainFile: path.basename(patchedMainFilename),
      versionFile: path.basename(patchedVersionFilename),
      minimum,
    });
    return true;
  };

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
  writeHookStatus(statusPath, "installed", { minimum });
  deadline = setTimeout(() => {
    if (!mainPatched || !versionPatched) {
      incompatible(
        "SpineCodex SSH hook did not observe compatible Codex bundles before its deadline",
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
  patchVersionCompatibilitySource,
  patchVersionBundleCandidateSource,
  writeHookStatus,
  installMainProcessHook,
};

installMainProcessHook();
