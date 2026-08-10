import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { createAppServerOutputFilter } from "../lib/app-server-output-filter.mjs";

async function filterChunks(chunks, options = {}) {
  let output = "";
  let suppressed = 0;
  const filter = createAppServerOutputFilter({
    ...options,
    onSuppressed(count) {
      suppressed = count;
    },
  });
  filter.setEncoding("utf8");
  filter.on("data", (chunk) => { output += chunk; });
  for (const chunk of chunks) filter.write(chunk);
  filter.end();
  await once(filter, "end");
  return { output, suppressed };
}

test("duplicate app catalog notifications are removed across stream chunks", async () => {
  const update = JSON.stringify({
    method: "app/list/updated",
    params: { data: [{ id: "one" }, { id: "two" }] },
  });
  const response = JSON.stringify({ id: 1, result: { data: [{ id: "one" }] } });
  const input = `${update}\n${response}\n${update}\n`;
  const midpoint = Math.floor(input.length / 2);
  const result = await filterChunks([input.slice(0, midpoint), input.slice(midpoint)]);

  assert.equal(result.output, `${update}\n${response}\n`);
  assert.equal(result.suppressed, 1);
});

test("a genuinely changed app catalog is forwarded", async () => {
  const first = JSON.stringify({
    method: "app/list/updated",
    params: { data: [{ id: "one" }] },
  });
  const changed = JSON.stringify({
    method: "app/list/updated",
    params: { data: [{ id: "one" }, { id: "two" }] },
  });
  const result = await filterChunks([`${first}\n${changed}\n`]);

  assert.equal(result.output, `${first}\n${changed}\n`);
  assert.equal(result.suppressed, 0);
});

test("a recently seen catalog is suppressed after an intervening update", async () => {
  const first = JSON.stringify({
    method: "app/list/updated",
    params: { data: [{ id: "one" }] },
  });
  const changed = JSON.stringify({
    method: "app/list/updated",
    params: { data: [{ id: "two" }] },
  });
  const result = await filterChunks([`${first}\n${changed}\n${first}\n`]);

  assert.equal(result.output, `${first}\n${changed}\n`);
  assert.equal(result.suppressed, 1);
});

test("semantically identical catalog arrays are order independent", async () => {
  const first = JSON.stringify({
    method: "app/list/updated",
    params: {
      data: [{
        id: "one",
        labels: ["beta", "alpha"],
        iconAssets: [{ url: "two" }, { url: "one" }],
      }],
    },
  });
  const reordered = JSON.stringify({
    method: "app/list/updated",
    params: {
      data: [{
        iconAssets: [{ url: "one" }, { url: "two" }],
        labels: ["alpha", "beta"],
        id: "one",
      }],
    },
  });
  const result = await filterChunks([`${first}\n${reordered}\n`]);

  assert.equal(result.output, `${first}\n`);
  assert.equal(result.suppressed, 1);
});

test("a catalog can be forwarded again after the dedupe window", async () => {
  let timestamp = 1_000;
  const update = JSON.stringify({
    method: "app/list/updated",
    params: { data: [{ id: "one" }] },
  });
  const filter = createAppServerOutputFilter({ now: () => timestamp });
  let output = "";
  filter.setEncoding("utf8");
  filter.on("data", (chunk) => { output += chunk; });
  filter.write(`${update}\n`);
  timestamp += 10_000;
  filter.end(`${update}\n`);
  await once(filter, "end");

  assert.equal(output, `${update}\n${update}\n`);
});

test("malformed and unrelated output passes through unchanged", async () => {
  const input = "diagnostic app/list/updated text\n{not-json}\nfinal-line";
  const result = await filterChunks([input]);

  assert.equal(result.output, input);
  assert.equal(result.suppressed, 0);
});
