const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1"]);

export async function injectMainProcessHook({
  port,
  hookPath,
  timeoutMs = 10_000,
  fetchImpl = fetch,
  WebSocketImpl = WebSocket,
}) {
  const target = await waitForInspectorTarget(port, { timeoutMs, fetchImpl });
  const url = validateInspectorWebSocketUrl(target.webSocketDebuggerUrl, port);
  const socket = new WebSocketImpl(url);
  await waitForSocketOpen(socket, timeoutMs);
  const protocol = createProtocolClient(socket, timeoutMs);
  let paused = false;

  try {
    await protocol.command("Runtime.enable");
    await protocol.command("Debugger.enable");
    const pausedEvent = protocol.event("Debugger.paused");
    await protocol.command("Runtime.runIfWaitingForDebugger");
    const { callFrames = [] } = await pausedEvent;
    paused = true;

    const callFrameId = await findCommonJsCallFrame(protocol, callFrames);
    if (!callFrameId) {
      throw new Error(
        "Electron main process paused without a CommonJS frame; " +
          "the SpineCodex hook was not loaded",
      );
    }

    const expression =
      `require(${JSON.stringify(hookPath)});` +
      `({loaded:true,electron:process.versions.electron||null,type:process.type||null})`;
    const evaluation = await protocol.command("Debugger.evaluateOnCallFrame", {
      callFrameId,
      expression,
      returnByValue: true,
      throwOnSideEffect: false,
    });
    if (evaluation.exceptionDetails) {
      throw new Error(
        "failed to load the SpineCodex main-process hook: " +
          formatException(evaluation.exceptionDetails),
      );
    }
    const result = evaluation.result?.value;
    if (!result?.loaded) {
      throw new Error("the SpineCodex main-process hook returned no load confirmation");
    }

    await protocol.command("Debugger.resume");
    paused = false;
    return result;
  } catch (error) {
    if (paused) {
      try { await protocol.command("Debugger.resume"); } catch {}
    }
    throw error;
  } finally {
    protocol.close();
  }
}

export async function waitForInspectorTarget(
  port,
  { timeoutMs = 10_000, fetchImpl = fetch } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`http://127.0.0.1:${port}/json/list`, {
        signal: AbortSignal.timeout(Math.min(800, Math.max(1, deadline - Date.now()))),
      });
      if (!response.ok) throw new Error(`Inspector returned HTTP ${response.status}`);
      const targets = await response.json();
      const target = targets.find((item) =>
        typeof item?.webSocketDebuggerUrl === "string" &&
        (item.type === "node" || item.type == null));
      if (target) return target;
    } catch (error) {
      lastError = error;
    }
    await delay(40);
  }
  throw new Error(
    "timed out waiting for the loopback Electron main-process Inspector: " +
      (lastError?.message ?? "no target"),
  );
}

export function validateInspectorWebSocketUrl(value, expectedPort) {
  const url = new URL(value);
  if (
    url.protocol !== "ws:" ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    Number(url.port) !== Number(expectedPort)
  ) {
    throw new Error("refusing unsafe Electron main-process Inspector URL");
  }
  return url.href;
}

async function findCommonJsCallFrame(protocol, callFrames) {
  for (const frame of callFrames) {
    const probe = await protocol.command("Debugger.evaluateOnCallFrame", {
      callFrameId: frame.callFrameId,
      expression: 'typeof require === "function" && typeof process === "object"',
      returnByValue: true,
      silent: true,
    });
    if (!probe.exceptionDetails && probe.result?.value === true) {
      return frame.callFrameId;
    }
  }
  return null;
}

function createProtocolClient(socket, timeoutMs) {
  let nextId = 0;
  const pending = new Map();
  const eventWaiters = new Map();

  const rejectAll = (error) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
    for (const waiters of eventWaiters.values()) {
      for (const { reject, timer } of waiters) {
        clearTimeout(timer);
        reject(error);
      }
    }
    eventWaiters.clear();
  };

  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.id != null) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) {
        request.reject(new Error(JSON.stringify(message.error)));
      } else {
        request.resolve(message.result);
      }
      return;
    }
    if (!message.method) return;
    const waiters = eventWaiters.get(message.method);
    if (!waiters?.length) return;
    const waiter = waiters.shift();
    clearTimeout(waiter.timer);
    waiter.resolve(message.params ?? {});
    if (!waiters.length) eventWaiters.delete(message.method);
  });
  socket.addEventListener("error", () => {
    rejectAll(new Error("Electron main-process Inspector connection failed"));
  });
  socket.addEventListener("close", () => {
    rejectAll(new Error("Electron main-process Inspector connection closed"));
  });

  return {
    command(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out`));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    event(method) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const waiters = eventWaiters.get(method) ?? [];
          const index = waiters.findIndex((entry) => entry.resolve === resolve);
          if (index >= 0) waiters.splice(index, 1);
          if (!waiters.length) eventWaiters.delete(method);
          reject(new Error(`${method} event timed out`));
        }, timeoutMs);
        const waiters = eventWaiters.get(method) ?? [];
        waiters.push({ resolve, reject, timer });
        eventWaiters.set(method, waiters);
      });
    },
    close() {
      try { socket.close(); } catch {}
    },
  };
}

function waitForSocketOpen(socket, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Electron main-process Inspector connection timed out")),
      timeoutMs,
    );
    socket.addEventListener("open", () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("Electron main-process Inspector connection failed"));
    }, { once: true });
  });
}

function formatException(details) {
  return details.exception?.description ?? details.text ?? "unknown exception";
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
