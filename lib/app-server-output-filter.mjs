import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";

const APP_LIST_UPDATED_METHOD = "app/list/updated";
const DEFAULT_DEDUPE_WINDOW_MS = 10_000;
const DEFAULT_RECENT_DIGEST_LIMIT = 8;

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).sort().join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function catalogDigest(params) {
  return createHash("sha256")
    .update(stableSerialize(params?.data ?? params ?? null))
    .digest("hex");
}

export function createAppServerOutputFilter(options = {}) {
  const decoder = new StringDecoder("utf8");
  const onSuppressed = options.onSuppressed ?? (() => {});
  const now = options.now ?? Date.now;
  const dedupeWindowMs = options.dedupeWindowMs ?? DEFAULT_DEDUPE_WINDOW_MS;
  const recentDigestLimit =
    options.recentDigestLimit ?? DEFAULT_RECENT_DIGEST_LIMIT;
  let lineParts = [];
  const recentAppListDigests = new Map();
  let suppressedAppListUpdates = 0;

  const shouldForward = (line) => {
    if (!line.includes(APP_LIST_UPDATED_METHOD)) return true;
    try {
      const message = JSON.parse(line);
      if (message?.method !== APP_LIST_UPDATED_METHOD) return true;
      const digest = catalogDigest(message.params);
      const timestamp = now();
      for (const [candidate, seenAt] of recentAppListDigests) {
        if (timestamp - seenAt >= dedupeWindowMs) {
          recentAppListDigests.delete(candidate);
        }
      }
      if (!recentAppListDigests.has(digest)) {
        recentAppListDigests.set(digest, timestamp);
        while (recentAppListDigests.size > recentDigestLimit) {
          recentAppListDigests.delete(recentAppListDigests.keys().next().value);
        }
        return true;
      }
      recentAppListDigests.delete(digest);
      recentAppListDigests.set(digest, timestamp);
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
