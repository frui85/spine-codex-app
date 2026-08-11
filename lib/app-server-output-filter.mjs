import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";

const APP_LIST_UPDATED_METHOD = "app/list/updated";
const PLUGIN_DISPLAY_NAMES_KEY = "pluginDisplayNames";

function stableSerialize(value, omittedKey) {
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => stableSerialize(item, omittedKey))
      .sort()
      .join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .filter((key) => key !== omittedKey)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableSerialize(value[key], omittedKey)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function catalogIdentityDigest(params) {
  return createHash("sha256")
    .update(
      stableSerialize(
        params?.data ?? params ?? null,
        PLUGIN_DISPLAY_NAMES_KEY,
      ),
    )
    .digest("hex");
}

function catalogPluginDisplayNames(params) {
  const displayNames = new Set();
  const apps = Array.isArray(params?.data) ? params.data : [];
  for (const app of apps) {
    if (app === null || typeof app !== "object") continue;
    if (!Array.isArray(app[PLUGIN_DISPLAY_NAMES_KEY])) continue;
    for (const displayName of app[PLUGIN_DISPLAY_NAMES_KEY]) {
      if (typeof displayName !== "string") continue;
      displayNames.add(JSON.stringify([app.id ?? null, displayName]));
    }
  }
  return displayNames;
}

export function createAppServerOutputFilter(options = {}) {
  const decoder = new StringDecoder("utf8");
  const onSuppressed = options.onSuppressed ?? (() => {});
  let lineParts = [];
  let currentCatalogIdentityDigest;
  let observedPluginDisplayNames = new Set();
  let suppressedAppListUpdates = 0;

  const shouldForward = (line) => {
    if (!line.includes(APP_LIST_UPDATED_METHOD)) return true;
    try {
      const message = JSON.parse(line);
      if (message?.method !== APP_LIST_UPDATED_METHOD) return true;
      const identityDigest = catalogIdentityDigest(message.params);
      const pluginDisplayNames = catalogPluginDisplayNames(message.params);
      if (identityDigest !== currentCatalogIdentityDigest) {
        currentCatalogIdentityDigest = identityDigest;
        observedPluginDisplayNames = pluginDisplayNames;
        return true;
      }
      const addsPluginDisplayName = [...pluginDisplayNames].some(
        (displayName) => !observedPluginDisplayNames.has(displayName),
      );
      if (addsPluginDisplayName) {
        for (const displayName of pluginDisplayNames) {
          observedPluginDisplayNames.add(displayName);
        }
        return true;
      }
      suppressedAppListUpdates += 1;
      onSuppressed(suppressedAppListUpdates);
      return false;
    } catch {
      return true;
    }
  };

  const consume = (stream, text, final = false) => {
    let start = 0;
    let newlineIndex;
    while ((newlineIndex = text.indexOf("\n", start)) !== -1) {
      const part = text.slice(start, newlineIndex);
      const line = lineParts.length > 0 ? lineParts.join("") + part : part;
      lineParts = [];
      if (shouldForward(line)) stream.push(`${line}\n`);
      start = newlineIndex + 1;
    }
    const remainder = text.slice(start);
    if (remainder.length > 0) lineParts.push(remainder);
    if (final && lineParts.length > 0) {
      const line = lineParts.join("");
      if (shouldForward(line)) stream.push(line);
      lineParts = [];
    }
  };

  return new Transform({
    transform(chunk, _encoding, callback) {
      consume(this, decoder.write(chunk));
      callback();
    },
    flush(callback) {
      consume(this, decoder.end(), true);
      callback();
    },
  });
}
