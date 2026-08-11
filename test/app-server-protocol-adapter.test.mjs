import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createAppServerProtocolAdapter } from "../lib/app-server-protocol-adapter.mjs";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const SHIM = join(ROOT, "bin", "spine-codex.mjs");

function createHarness(options = {}) {
  const toServer = [];
  const toClient = [];
  const fallbacks = [];
  const adapter = createAppServerProtocolAdapter({
    internalIdPrefix: "__test_",
    writeToServer(line) {
      toServer.push(line);
    },
    writeToClient(line) {
      toClient.push(line);
    },
    onLegacyFallback(method) {
      fallbacks.push(method);
    },
    ...options,
  });
  return {
    adapter,
    toServer,
    toClient,
    fallbacks,
    client(message) {
      adapter.acceptClientLine(
        typeof message === "string" ? message : JSON.stringify(message),
      );
    },
    server(message) {
      adapter.acceptServerLine(
        typeof message === "string" ? message : JSON.stringify(message),
      );
    },
    serverMessages() {
      return toServer.map((line) => JSON.parse(line));
    },
    clientMessages() {
      return toClient.map((line) => JSON.parse(line));
    },
  };
}

function unsupported(
  id,
  message = "Invalid request: unknown variant `app/installed`",
  code = -32600,
) {
  return { id, error: { code, message } };
}

test("native app lifecycle support is probed once and then passed through", () => {
  const harness = createHarness();
  const first = {
    id: 7,
    method: "app/installed",
    params: { forceRefresh: false },
  };
  const queued = {
    id: 8,
    method: "app/installed",
    params: { forceRefresh: true },
  };
  harness.client(first);
  harness.client(queued);

  assert.equal(harness.toServer.length, 1);
  const probe = harness.serverMessages()[0];
  assert.match(probe.id, /^__test_probe_/);
  assert.equal(probe.method, "app/installed");

  harness.server({
    id: probe.id,
    result: {
      apps: [{ id: "native", runtimeName: "Native", enabled: true, callable: true }],
    },
  });

  assert.deepEqual(harness.clientMessages(), [{
    id: 7,
    result: {
      apps: [{ id: "native", runtimeName: "Native", enabled: true, callable: true }],
    },
  }]);
  assert.deepEqual(harness.serverMessages()[1], queued);
  assert.deepEqual(harness.fallbacks, []);

  const later = { id: 9, method: "app/installed", params: {} };
  harness.client(later);
  assert.deepEqual(harness.serverMessages()[2], later);
});

test("unsupported app methods fall back to paginated app/list metadata", () => {
  const harness = createHarness();
  harness.client({
    id: "installed",
    method: "app/installed",
    params: { threadId: "thread-1", forceRefresh: false },
  });
  const installedProbe = harness.serverMessages()[0];
  harness.server(unsupported(installedProbe.id));

  const firstPage = harness.serverMessages()[1];
  assert.deepEqual(firstPage, {
    id: firstPage.id,
    method: "app/list",
    params: {
      cursor: null,
      limit: 1000,
      forceRefetch: false,
      threadId: "thread-1",
    },
  });
  harness.server({
    id: firstPage.id,
    result: {
      data: [{
        id: "app-a",
        name: "App A",
        description: "First app",
        logoUrl: "https://example.test/a-light.png",
        logoUrlDark: "https://example.test/a-dark.png",
        distributionChannel: "marketplace",
        installUrl: "https://example.test/install/a",
        pluginDisplayNames: ["Plugin A", "Plugin A"],
        isAccessible: true,
        isEnabled: true,
        tools: [{
          name: "search",
          title: "Search",
          description: "Search App A",
          enabled: true,
          readOnly: true,
        }],
      }, {
        id: "app-b",
        name: "App B",
        isAccessible: true,
        isEnabled: false,
      }],
      nextCursor: "page-2",
    },
  });
  const secondPage = harness.serverMessages()[2];
  assert.equal(secondPage.method, "app/list");
  assert.equal(secondPage.params.cursor, "page-2");
  assert.equal(secondPage.params.forceRefetch, false);
  harness.server({
    id: secondPage.id,
    result: {
      data: [{
        id: "app-a",
        name: "duplicate",
        isAccessible: true,
        isEnabled: true,
      }, {
        id: "inaccessible",
        name: "Unavailable",
        isAccessible: false,
        isEnabled: true,
      }],
      nextCursor: null,
    },
  });

  assert.deepEqual(harness.clientMessages()[0], {
    id: "installed",
    result: {
      apps: [
        { id: "app-a", runtimeName: "App A", enabled: true, callable: true },
        { id: "app-b", runtimeName: "App B", enabled: false, callable: false },
      ],
    },
  });

  harness.client({
    id: "read",
    method: "app/read",
    params: {
      appIds: ["inaccessible", "app-a", "app-a", "missing"],
      includeTools: true,
    },
  });
  const readProbe = harness.serverMessages()[3];
  assert.equal(readProbe.method, "app/read");
  harness.server(unsupported(readProbe.id, "Method not found: app/read", -32601));

  assert.deepEqual(harness.clientMessages()[1], {
    id: "read",
    result: {
      apps: [{
        id: "app-a",
        name: "App A",
        description: "First app",
        iconUrl: "https://example.test/a-light.png",
        iconUrlDark: "https://example.test/a-dark.png",
        distributionChannel: "marketplace",
        installUrl: "https://example.test/install/a",
        pluginDisplayNames: ["Plugin A"],
        toolSummaries: [{
          name: "search",
          title: "Search",
          description: "Search App A",
          isEnabled: true,
          disabledReason: null,
          isReadOnly: true,
        }],
      }],
      missingAppIds: ["inaccessible", "missing"],
    },
  });
  assert.deepEqual(harness.fallbacks, ["app/installed", "app/read"]);
  assert.equal(harness.toServer.length, 4, "app/read reuses the app/list catalog");
});

test("concurrent legacy requests share one catalog load", () => {
  const harness = createHarness();
  harness.client({ id: 1, method: "app/installed", params: {} });
  harness.client({ id: 2, method: "app/installed", params: {} });
  const probe = harness.serverMessages()[0];
  harness.server(unsupported(probe.id));

  assert.equal(harness.toServer.length, 2);
  const list = harness.serverMessages()[1];
  harness.server({
    id: list.id,
    result: {
      data: [{ id: "one", name: "One", isAccessible: true, isEnabled: true }],
      nextCursor: null,
    },
  });

  assert.deepEqual(harness.clientMessages(), [
    {
      id: 1,
      result: { apps: [{ id: "one", runtimeName: "One", enabled: true, callable: true }] },
    },
    {
      id: 2,
      result: { apps: [{ id: "one", runtimeName: "One", enabled: true, callable: true }] },
    },
  ]);
});

test("fresh catalog notifications absorb forceRefresh feedback without app/list", () => {
  let clock = 1_000;
  const harness = createHarness({
    now: () => clock,
    refreshCooldownMs: 5_000,
  });
  harness.client({ id: 1, method: "app/installed", params: {} });
  const probe = harness.serverMessages()[0];
  harness.server(unsupported(probe.id));
  const initialList = harness.serverMessages()[1];
  harness.server({ id: initialList.id, result: { data: [], nextCursor: null } });

  const update = {
    method: "app/list/updated",
    params: {
      data: [{ id: "fresh", name: "Fresh", isAccessible: true, isEnabled: true }],
    },
  };
  harness.server(update);
  const serverCount = harness.toServer.length;
  harness.client({
    id: 2,
    method: "app/installed",
    params: { forceRefresh: true },
  });

  assert.equal(harness.toServer.length, serverCount);
  assert.deepEqual(harness.clientMessages().at(-1), {
    id: 2,
    result: {
      apps: [{ id: "fresh", runtimeName: "Fresh", enabled: true, callable: true }],
    },
  });
  assert.deepEqual(harness.clientMessages().at(-2), update);

  clock += 5_001;
  harness.client({
    id: 3,
    method: "app/installed",
    params: { forceRefresh: true },
  });
  assert.equal(harness.serverMessages().at(-1).method, "app/list");
  assert.equal(harness.serverMessages().at(-1).params.forceRefetch, true);
});

test("thread-scoped legacy catalogs use a bounded LRU cache", () => {
  const harness = createHarness({ maxThreadCatalogs: 2 });
  const request = (id, threadId) => {
    harness.client({
      id,
      method: "app/installed",
      params: { threadId, forceRefresh: false },
    });
  };
  const respondToLatestList = (appId) => {
    const list = harness.serverMessages().at(-1);
    assert.equal(list.method, "app/list");
    harness.server({
      id: list.id,
      result: {
        data: [{ id: appId, name: appId, isAccessible: true, isEnabled: true }],
        nextCursor: null,
      },
    });
  };

  request(1, "thread-1");
  harness.server(unsupported(harness.serverMessages()[0].id));
  respondToLatestList("one");
  request(2, "thread-2");
  respondToLatestList("two");
  const beforeTouch = harness.toServer.length;
  request(3, "thread-1");
  assert.equal(harness.toServer.length, beforeTouch);

  request(4, "thread-3");
  respondToLatestList("three");

  const beforeCachedRequest = harness.toServer.length;
  request(5, "thread-1");
  assert.equal(harness.toServer.length, beforeCachedRequest);

  request(6, "thread-2");
  assert.equal(harness.serverMessages().at(-1).method, "app/list");
  assert.equal(harness.serverMessages().at(-1).params.threadId, "thread-2");
});

test("a universal catalog notification supersedes stale thread catalogs", () => {
  const harness = createHarness();
  harness.client({
    id: 1,
    method: "app/installed",
    params: { threadId: "thread-1" },
  });
  harness.server(unsupported(harness.serverMessages()[0].id));
  const list = harness.serverMessages()[1];
  harness.server({
    id: list.id,
    result: {
      data: [{ id: "stale", name: "Stale", isAccessible: true, isEnabled: true }],
      nextCursor: null,
    },
  });

  harness.server({
    method: "app/list/updated",
    params: {
      data: [{ id: "fresh", name: "Fresh", isAccessible: true, isEnabled: true }],
    },
  });
  const beforeRequest = harness.toServer.length;
  harness.client({
    id: 2,
    method: "app/installed",
    params: { threadId: "thread-1", forceRefresh: true },
  });

  assert.equal(harness.toServer.length, beforeRequest);
  assert.deepEqual(harness.clientMessages().at(-1), {
    id: 2,
    result: {
      apps: [{ id: "fresh", runtimeName: "Fresh", enabled: true, callable: true }],
    },
  });
});

test("app/read validates ids before probing", () => {
  const harness = createHarness();
  harness.client({
    id: "bad",
    method: "app/read",
    params: { appIds: [42] },
  });
  assert.equal(harness.toServer.length, 0);
  assert.deepEqual(harness.clientMessages()[0], {
    id: "bad",
    error: {
      code: -32602,
      message: "app/read requires at most 100 string appIds",
    },
  });
});

test("unrelated and malformed JSONL records pass through unchanged", () => {
  const harness = createHarness();
  const request = JSON.stringify({ id: 1, method: "thread/list", params: {} });
  harness.client(request);
  harness.client("{not-json}");
  const notification = JSON.stringify({ method: "thread/updated", params: {} });
  harness.server(notification);
  harness.server("diagnostic text");

  assert.deepEqual(harness.toServer, [request, "{not-json}"]);
  assert.deepEqual(harness.toClient, [notification, "diagnostic text"]);
});

test("stdio shim hides compatibility probes from the desktop client", {
  skip: process.platform === "win32",
}, async () => {
  const directory = await mkdtemp(join(tmpdir(), "spine-app-protocol-"));
  const fakeBackend = join(directory, "fake-legacy-app-server.mjs");
  try {
    await writeFile(fakeBackend, `#!/usr/bin/env node
import readline from "node:readline";
const input = readline.createInterface({ input: process.stdin });
input.on("line", (line) => {
  const request = JSON.parse(line);
  if (request.method === "app/installed" || request.method === "app/read") {
    process.stdout.write(JSON.stringify({
      id: request.id,
      error: { code: -32601, message: "Unknown method: " + request.method },
    }) + "\\n");
    return;
  }
  if (request.method === "app/list") {
    process.stdout.write(JSON.stringify({
      id: request.id,
      result: {
        data: [{
          id: "legacy-app",
          name: "Legacy App",
          description: "Mapped through app/list",
          isAccessible: true,
          isEnabled: true,
        }],
        nextCursor: null,
      },
    }) + "\\n");
  }
});
`, "utf8");
    await chmod(fakeBackend, 0o755);

    const child = spawn(process.execPath, [SHIM, "app-server"], {
      env: { ...process.env, SPINE_CODEX_BINARY: fakeBackend },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdin.end([
      JSON.stringify({ id: 1, method: "app/installed", params: {} }),
      JSON.stringify({
        id: 2,
        method: "app/read",
        params: { appIds: ["legacy-app"], includeTools: false },
      }),
      "",
    ].join("\n"));

    const [status] = await once(child, "exit");
    assert.equal(status, 0, stderr);
    const messages = stdout.trim().split("\n").map((line) => JSON.parse(line));
    assert.deepEqual(messages, [{
      id: 1,
      result: {
        apps: [{
          id: "legacy-app",
          runtimeName: "Legacy App",
          enabled: true,
          callable: true,
        }],
      },
    }, {
      id: 2,
      result: {
        apps: [{
          id: "legacy-app",
          name: "Legacy App",
          description: "Mapped through app/list",
          iconUrl: null,
          iconUrlDark: null,
          distributionChannel: null,
          installUrl: null,
          pluginDisplayNames: [],
          toolSummaries: null,
        }],
        missingAppIds: [],
      },
    }]);
    assert.doesNotMatch(stdout, /__spine_app_compat/);
    assert.match(stderr, /legacy app\/list compatibility for app\/installed/);
    assert.match(stderr, /legacy app\/list compatibility for app\/read/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
