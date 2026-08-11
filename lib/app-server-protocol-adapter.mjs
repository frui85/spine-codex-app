const APP_INSTALLED_METHOD = "app/installed";
const APP_LIST_METHOD = "app/list";
const APP_LIST_UPDATED_METHOD = "app/list/updated";
const APP_READ_METHOD = "app/read";
const TARGET_METHODS = new Set([APP_INSTALLED_METHOD, APP_READ_METHOD]);

const DEFAULT_PAGE_LIMIT = 1_000;
const DEFAULT_REFRESH_COOLDOWN_MS = 5_000;
const DEFAULT_MAX_THREAD_CATALOGS = 4;
const GLOBAL_SCOPE = "global";

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function parseObject(line) {
  try {
    const value = JSON.parse(line);
    return value !== null && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

function scopeKey(threadId) {
  return typeof threadId === "string"
    ? `thread:${JSON.stringify(threadId)}`
    : GLOBAL_SCOPE;
}

function unsupportedMethod(error) {
  if (error === null || typeof error !== "object") return false;
  if (error.code === -32601) return true;
  const message = typeof error.message === "string" ? error.message : "";
  return /unknown method|unknown variant|method not found|unsupported method|not implemented/i.test(
    message,
  );
}

function uniqueApps(apps) {
  const result = [];
  const seen = new Set();
  for (const app of Array.isArray(apps) ? apps : []) {
    if (app === null || typeof app !== "object") continue;
    if (typeof app.id !== "string" || seen.has(app.id)) continue;
    seen.add(app.id);
    result.push(app);
  }
  return result;
}

function nullableString(value) {
  return typeof value === "string" ? value : null;
}

function pluginDisplayNames(app) {
  const names = [];
  const seen = new Set();
  for (const name of Array.isArray(app.pluginDisplayNames)
    ? app.pluginDisplayNames
    : []) {
    if (typeof name !== "string" || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

function toolSummaries(app) {
  const source = Array.isArray(app.toolSummaries)
    ? app.toolSummaries
    : Array.isArray(app.tools)
      ? app.tools
      : [];
  const summaries = [];
  for (const tool of source) {
    if (tool === null || typeof tool !== "object") continue;
    if (typeof tool.name !== "string") continue;
    summaries.push({
      name: tool.name,
      title: nullableString(tool.title),
      description: nullableString(tool.description),
      isEnabled:
        typeof tool.isEnabled === "boolean"
          ? tool.isEnabled
          : typeof tool.enabled === "boolean"
            ? tool.enabled
            : true,
      disabledReason: nullableString(tool.disabledReason),
      isReadOnly:
        typeof tool.isReadOnly === "boolean"
          ? tool.isReadOnly
          : tool.readOnly === true,
    });
  }
  return summaries;
}

function installedResult(catalog) {
  const apps = [];
  for (const app of catalog.apps) {
    if (app.isAccessible !== true) continue;
    const enabled = app.isEnabled === true;
    apps.push({
      id: app.id,
      runtimeName:
        nullableString(app.runtimeName) ?? nullableString(app.name),
      enabled,
      // Legacy app/list has no effective tool-policy state. Accessibility plus
      // the effective app switch is the closest safe callable approximation.
      callable: enabled,
    });
  }
  return { apps };
}

function readResult(catalog, params) {
  const requestedIds = [];
  const seen = new Set();
  for (const id of params.appIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    requestedIds.push(id);
  }

  const byId = new Map(catalog.apps.map((app) => [app.id, app]));
  const apps = [];
  const missingAppIds = [];
  for (const id of requestedIds) {
    const app = byId.get(id);
    if (!app || app.isAccessible !== true) {
      missingAppIds.push(id);
      continue;
    }
    const metadata = {
      id,
      name: nullableString(app.name),
      description: nullableString(app.description),
      iconUrl: nullableString(app.iconUrl) ?? nullableString(app.logoUrl),
      iconUrlDark:
        nullableString(app.iconUrlDark) ?? nullableString(app.logoUrlDark),
      distributionChannel: nullableString(app.distributionChannel),
      installUrl: nullableString(app.installUrl),
      pluginDisplayNames: pluginDisplayNames(app),
    };
    metadata.toolSummaries =
      params.includeTools === true ? toolSummaries(app) : null;
    apps.push(metadata);
  }
  return { apps, missingAppIds };
}

function responseFor(request, body) {
  const response = { id: request.id, ...body };
  if (request.jsonrpc !== undefined) response.jsonrpc = request.jsonrpc;
  return response;
}

function invalidReadParams(request) {
  const appIds = request.params?.appIds;
  if (
    !Array.isArray(appIds) ||
    appIds.length > 100 ||
    appIds.some((id) => typeof id !== "string")
  ) {
    return responseFor(request, {
      error: {
        code: -32602,
        message: "app/read requires at most 100 string appIds",
      },
    });
  }
  return null;
}

/**
 * Adapts the newer app/installed + app/read lifecycle to legacy app/list while
 * preserving native support when the backend already implements the methods.
 * All callbacks receive one JSONL record without the trailing newline.
 */
export function createAppServerProtocolAdapter(options) {
  if (typeof options?.writeToServer !== "function") {
    throw new TypeError("writeToServer must be a function");
  }
  if (typeof options?.writeToClient !== "function") {
    throw new TypeError("writeToClient must be a function");
  }

  const writeToServer = options.writeToServer;
  const writeToClient = options.writeToClient;
  const onLegacyFallback = options.onLegacyFallback ?? (() => {});
  const onIdle = options.onIdle ?? (() => {});
  const now = options.now ?? Date.now;
  const pageLimit = options.pageLimit ?? DEFAULT_PAGE_LIMIT;
  const refreshCooldownMs =
    options.refreshCooldownMs ?? DEFAULT_REFRESH_COOLDOWN_MS;
  const maxThreadCatalogs = Math.max(
    1,
    options.maxThreadCatalogs ?? DEFAULT_MAX_THREAD_CATALOGS,
  );
  const internalIdPrefix =
    options.internalIdPrefix ??
    `__spine_app_compat_${process.pid}_${Math.random().toString(36).slice(2)}_`;

  const capabilities = new Map(
    [...TARGET_METHODS].map((method) => [
      method,
      { state: "unknown", queued: [] },
    ]),
  );
  const internalRequests = new Map();
  const catalogCache = new Map();
  const catalogLoads = new Map();
  let latestCatalog = null;
  let internalId = 0;
  let clientInputEnded = false;
  let idleReported = false;

  const maybeReportIdle = () => {
    if (
      clientInputEnded &&
      !idleReported &&
      internalRequests.size === 0 &&
      catalogLoads.size === 0 &&
      [...capabilities.values()].every(
        (capability) =>
          capability.state !== "probing" && capability.queued.length === 0,
      )
    ) {
      idleReported = true;
      onIdle();
    }
  };

  const nextInternalId = (kind) =>
    `${internalIdPrefix}${kind}_${(internalId += 1)}`;

  const sendObjectToServer = (message) => {
    writeToServer(JSON.stringify(message));
  };

  const sendObjectToClient = (message) => {
    writeToClient(JSON.stringify(message));
  };

  const rememberCatalog = (apps, key, universal = false) => {
    if (universal) catalogCache.clear();
    const catalog = {
      apps: uniqueApps(apps),
      updatedAt: now(),
      universal,
    };
    catalogCache.delete(key);
    catalogCache.set(key, catalog);
    if (key !== GLOBAL_SCOPE) {
      const threadKeys = [...catalogCache.keys()].filter(
        (catalogKey) => catalogKey !== GLOBAL_SCOPE,
      );
      while (threadKeys.length > maxThreadCatalogs) {
        catalogCache.delete(threadKeys.shift());
      }
    }
    latestCatalog = catalog;
    return catalog;
  };

  const cachedCatalog = (key) => {
    const exact = catalogCache.get(key);
    if (exact) {
      if (key !== GLOBAL_SCOPE) {
        catalogCache.delete(key);
        catalogCache.set(key, exact);
      }
      return exact;
    }
    if (latestCatalog?.universal) return latestCatalog;
    return null;
  };

  const finishLegacyRequest = (request, catalog) => {
    const result =
      request.method === APP_INSTALLED_METHOD
        ? installedResult(catalog)
        : readResult(catalog, request.params);
    sendObjectToClient(responseFor(request, { result }));
  };

  const failCatalogLoad = (load, error) => {
    catalogLoads.delete(load.key);
    for (const request of load.waiters) {
      sendObjectToClient(responseFor(request, { error }));
    }
  };

  const sendCatalogPage = (load) => {
    const id = nextInternalId("list");
    internalRequests.set(id, { kind: "catalog-page", load });
    const params = {
      cursor: load.cursor,
      limit: pageLimit,
      forceRefetch: load.firstPage && load.forceRefetch,
    };
    if (load.threadId !== undefined) params.threadId = load.threadId;
    load.firstPage = false;
    sendObjectToServer({ id, method: APP_LIST_METHOD, params });
  };

  const startOrJoinCatalogLoad = (request, key, forceRefetch) => {
    const existing = catalogLoads.get(key);
    if (existing) {
      existing.waiters.push(request);
      return;
    }
    const load = {
      key,
      threadId:
        request.method === APP_INSTALLED_METHOD
          ? request.params?.threadId
          : undefined,
      forceRefetch,
      firstPage: true,
      cursor: null,
      seenCursors: new Set(),
      apps: [],
      appIds: new Set(),
      waiters: [request],
    };
    catalogLoads.set(key, load);
    sendCatalogPage(load);
  };

  const handleLegacyRequest = (request) => {
    if (request.method === APP_READ_METHOD) {
      const invalid = invalidReadParams(request);
      if (invalid) {
        sendObjectToClient(invalid);
        return;
      }
      if (latestCatalog) {
        finishLegacyRequest(request, latestCatalog);
        return;
      }
      startOrJoinCatalogLoad(request, GLOBAL_SCOPE, false);
      return;
    }

    const key = scopeKey(request.params?.threadId);
    const forceRefresh = request.params?.forceRefresh === true;
    const cached = cachedCatalog(key);
    const cacheIsFresh =
      cached && now() - cached.updatedAt < refreshCooldownMs;
    if (cached && (!forceRefresh || cacheIsFresh)) {
      finishLegacyRequest(request, cached);
      return;
    }
    startOrJoinCatalogLoad(request, key, forceRefresh);
  };

  const handleProbeResponse = (response, entry) => {
    const capability = capabilities.get(entry.method);
    const queued = capability.queued.splice(0);
    if (unsupportedMethod(response.error)) {
      capability.state = "legacy";
      onLegacyFallback(entry.method);
      for (const request of queued) handleLegacyRequest(request.message);
      return;
    }

    capability.state = "native";
    const first = queued.shift();
    if (first) {
      sendObjectToClient({ ...response, id: first.message.id });
    }
    for (const request of queued) writeToServer(request.line);
  };

  const handleCatalogPage = (response, entry) => {
    const load = entry.load;
    if (response.error) {
      failCatalogLoad(load, response.error);
      return;
    }
    if (!Array.isArray(response.result?.data)) {
      failCatalogLoad(load, {
        code: -32603,
        message: "legacy app/list returned an invalid result",
      });
      return;
    }

    for (const app of response.result.data) {
      if (
        app === null ||
        typeof app !== "object" ||
        typeof app.id !== "string" ||
        load.appIds.has(app.id)
      ) {
        continue;
      }
      load.appIds.add(app.id);
      load.apps.push(app);
    }

    const nextCursor = response.result.nextCursor;
    if (
      nextCursor !== null &&
      nextCursor !== undefined &&
      !load.seenCursors.has(nextCursor)
    ) {
      load.seenCursors.add(nextCursor);
      load.cursor = nextCursor;
      sendCatalogPage(load);
      return;
    }

    catalogLoads.delete(load.key);
    const catalog = rememberCatalog(
      load.apps,
      load.key,
      load.key === GLOBAL_SCOPE,
    );
    for (const request of load.waiters) finishLegacyRequest(request, catalog);
  };

  const acceptClientLine = (line) => {
    const request = parseObject(line);
    if (
      !request ||
      !hasOwn(request, "id") ||
      !TARGET_METHODS.has(request.method)
    ) {
      writeToServer(line);
      return;
    }

    if (request.method === APP_READ_METHOD) {
      const invalid = invalidReadParams(request);
      if (invalid) {
        sendObjectToClient(invalid);
        return;
      }
    }

    const capability = capabilities.get(request.method);
    if (capability.state === "native") {
      writeToServer(line);
      return;
    }
    if (capability.state === "legacy") {
      handleLegacyRequest(request);
      return;
    }

    capability.queued.push({ line, message: request });
    if (capability.state === "probing") return;
    capability.state = "probing";
    const id = nextInternalId("probe");
    internalRequests.set(id, {
      kind: "probe",
      method: request.method,
    });
    sendObjectToServer({ ...request, id });
  };

  const acceptServerLine = (line) => {
    const message = parseObject(line);
    if (!message) {
      writeToClient(line);
      return;
    }

    if (hasOwn(message, "id") && internalRequests.has(message.id)) {
      const entry = internalRequests.get(message.id);
      internalRequests.delete(message.id);
      if (entry.kind === "probe") handleProbeResponse(message, entry);
      else handleCatalogPage(message, entry);
      maybeReportIdle();
      return;
    }

    if (
      message.method === APP_LIST_UPDATED_METHOD &&
      Array.isArray(message.params?.data)
    ) {
      rememberCatalog(message.params.data, GLOBAL_SCOPE, true);
    }
    writeToClient(line);
  };

  const endClientInput = () => {
    clientInputEnded = true;
    maybeReportIdle();
  };

  return {
    acceptClientLine,
    acceptServerLine,
    endClientInput,
  };
}

export const APP_SERVER_PROTOCOL_METHODS = Object.freeze({
  installed: APP_INSTALLED_METHOD,
  list: APP_LIST_METHOD,
  listUpdated: APP_LIST_UPDATED_METHOD,
  read: APP_READ_METHOD,
});
