import { createHash } from "node:crypto";
import { Transform } from "node:stream";
import { StringDecoder } from "node:string_decoder";

const APP_LIST_UPDATED_METHOD = "app/list/updated";

export function createAppServerOutputFilter(options = {}) {
  const decoder = new StringDecoder("utf8");
  const onSuppressed = options.onSuppressed ?? (() => {});
  let lineParts = [];
  let lastAppListDigest = null;
  let suppressedAppListUpdates = 0;

  const shouldForward = (line) => {
    if (!line.includes(APP_LIST_UPDATED_METHOD)) return true;
    try {
      const message = JSON.parse(line);
      if (message?.method !== APP_LIST_UPDATED_METHOD) return true;
      const digest = createHash("sha256")
        .update(line)
        .digest("hex");
      if (digest !== lastAppListDigest) {
        lastAppListDigest = digest;
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
