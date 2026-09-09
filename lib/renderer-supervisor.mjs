// Adapted from izumedonabe/spine-codex-app 0a6a3a1 (Apache-2.0).
import { createHash } from "node:crypto";

const MAIN_RENDERER_ORIGIN = "app://-";
const MAIN_RENDERER_PATH = "/index.html";
const AVATAR_OVERLAY_ROUTE = "/avatar-overlay";

export function isMainRendererTarget(target) {
  if (
    target?.type !== "page" ||
    typeof target.webSocketDebuggerUrl !== "string"
  ) {
    return false;
  }
  try {
    const url = new URL(target.url);
    return (
      `${url.protocol}//${url.host}` === MAIN_RENDERER_ORIGIN &&
      url.pathname === MAIN_RENDERER_PATH &&
      url.searchParams.get("initialRoute") !== AVATAR_OVERLAY_ROUTE
    );
  } catch {
    return false;
  }
}

export function buildGuardedRendererSource(source) {
  const revision = createHash("sha256").update(source).digest("hex");
  return `(() => {
  const revision = ${JSON.stringify(revision)};
  const existing = window.__spineCodexViewV1;
  if (window.__spineCodexSupervisorRevision === revision && existing) {
    return existing.version || "ready";
  }
  try { existing?.destroy?.(); } catch {}
  const result = (() => { ${source.trim()}; return window.__spineCodexViewV1?.version; })();
  window.__spineCodexSupervisorRevision = revision;
  return result;
})()`;
}

export async function attachRendererTarget({
  target,
  port,
  source,
  WebSocketImpl = globalThis.WebSocket,
  commandTimeoutMs = 4_000,
}) {
  const url = new URL(target.webSocketDebuggerUrl);
  if (
    url.protocol !== "ws:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    Number(url.port) !== port
  ) {
    throw new Error("refusing unsafe CDP WebSocket URL");
  }
  if (typeof WebSocketImpl !== "function") {
    throw new Error("this Node.js build does not provide WebSocket support");
  }

  const socket = new WebSocketImpl(url);
  const pending = new Map();
  let nextId = 0;
  let finished = false;
  let finishClosed;
  const closed = new Promise((resolve) => {
    finishClosed = resolve;
  });

  const finish = (reason) => {
    if (finished) return;
    finished = true;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(
        new Error(`CDP connection closed during ${request.method}`),
      );
    }
    pending.clear();
    finishClosed(reason);
  };

  socket.addEventListener("close", () => finish("closed"), { once: true });
  socket.addEventListener("error", () => finish("error"), { once: true });

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("CDP connection timed out")),
        commandTimeoutMs,
      );
      socket.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      socket.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error("CDP connection failed"));
        },
        { once: true },
      );
    });
  } catch (error) {
    try {
      socket.close();
    } catch {}
    finish("open-failed");
    throw error;
  }

  const command = (method, params = {}) => {
    if (finished) return Promise.reject(new Error("CDP connection is closed"));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`${method} timed out`));
      }, commandTimeoutMs);
      pending.set(id, { resolve, reject, timer, method });
      socket.send(JSON.stringify({ id, method, params }));
    });
  };

  const evaluate = async () => {
    const result = await command("Runtime.evaluate", {
      expression: source,
      returnByValue: true,
    });
    if (result?.exceptionDetails) {
      throw new Error("renderer injection raised an exception");
    }
  };

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (Number.isInteger(message.id)) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) {
        request.reject(
          new Error(`${request.method}: ${JSON.stringify(message.error)}`),
        );
      } else {
        request.resolve(message.result);
      }
      return;
    }
    if (message.method === "Page.loadEventFired") {
      // The new-document registration handles ordinary reloads. This second,
      // guarded evaluation also recovers when registration happened late.
      void evaluate().catch(() => {});
    }
  });

  try {
    await command("Page.enable");
    await command("Page.addScriptToEvaluateOnNewDocument", { source });
    await evaluate();
  } catch (error) {
    try {
      socket.close();
    } catch {}
    finish("setup-failed");
    throw error;
  }

  return {
    targetId: target.id,
    webSocketDebuggerUrl: target.webSocketDebuggerUrl,
    closed,
    close() {
      try {
        socket.close();
      } catch {}
      finish("disposed");
    },
  };
}

export async function superviseRenderer({
  port,
  rendererSource,
  initialTimeoutMs = 20_000,
  shutdownGraceMs = 5_000,
  pollIntervalMs = 1_000,
  isDesktopRunning = null,
  onHealth = () => {},
  fetchImpl = globalThis.fetch,
  WebSocketImpl = globalThis.WebSocket,
  onReady = () => {},
  signal,
}) {
  const source = buildGuardedRendererSource(rendererSource);
  const sessions = new Map();
  const initialDeadline = Date.now() + initialTimeoutMs;
  let lastEndpointSuccess = null;
  let ready = false;
  let lastError = null;

  const disposeSessions = () => {
    for (const session of sessions.values()) session.close();
    sessions.clear();
  };

  try {
    while (!signal?.aborted) {
      if (isDesktopRunning && !isDesktopRunning()) return;
      try {
        const response = await fetchImpl(`http://127.0.0.1:${port}/json/list`, {
          signal: AbortSignal.timeout(800),
        });
        if (!response.ok)
          throw new Error(`CDP returned HTTP ${response.status}`);
        const targets = await response.json();
        lastEndpointSuccess = Date.now();
        const candidates = targets.filter(isMainRendererTarget);
        if (candidates.length > 1) {
          disposeSessions();
          throw new Error("ambiguous main Renderer targets");
        }
        const target = candidates[0];
        if (!target)
          onHealth("reconnecting", "Waiting for the main Renderer target");
        const activeIds = new Set(target ? [target.id] : []);

        for (const [targetId, session] of sessions) {
          if (
            !activeIds.has(targetId) ||
            session.webSocketDebuggerUrl !== target?.webSocketDebuggerUrl
          ) {
            session.close();
            sessions.delete(targetId);
          }
        }

        if (target && !sessions.has(target.id)) {
          try {
            const session = await attachRendererTarget({
              target,
              port,
              source,
              WebSocketImpl,
            });
            sessions.set(target.id, session);
            onHealth("ready");
            void session.closed.then(() => {
              if (sessions.get(target.id) === session)
                sessions.delete(target.id);
            });
            if (!ready) {
              ready = true;
              onReady(target);
            }
          } catch (error) {
            lastError = error;
            onHealth("reconnecting", error.message);
          }
        }
      } catch (error) {
        lastError = error;
        onHealth("reconnecting", error.message);
      }

      if (!ready && Date.now() >= initialDeadline) {
        throw new Error(
          `timed out waiting for Codex renderer: ${lastError?.message ?? "no target"}`,
        );
      }
      if (
        !isDesktopRunning &&
        ready &&
        lastEndpointSuccess != null &&
        Date.now() - lastEndpointSuccess >= shutdownGraceMs
      ) {
        return;
      }
      await delay(pollIntervalMs, signal);
    }
  } finally {
    disposeSessions();
  }
}

function delay(milliseconds, signal) {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal?.addEventListener("abort", finish, { once: true });
  });
}
