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

test("a catalog restored after an intervening update is forwarded", async () => {
  const first = JSON.stringify({
    method: "app/list/updated",
    params: { data: [{ id: "one" }] },
  });
  const changed = JSON.stringify({
    method: "app/list/updated",
    params: { data: [{ id: "two" }] },
  });
  const result = await filterChunks([`${first}\n${changed}\n${first}\n`]);

  assert.equal(result.output, `${first}\n${changed}\n${first}\n`);
  assert.equal(result.suppressed, 0);
});

test("transient plugin display-name enrichment converges instead of alternating", async () => {
  const baseApps = [
    { id: "sites", pluginDisplayNames: [] },
    { id: "github", pluginDisplayNames: [] },
    { id: "documents", pluginDisplayNames: [] },
  ];
  const base = JSON.stringify({
    method: "app/list/updated",
    params: { data: baseApps },
  });
  const enriched = JSON.stringify({
    method: "app/list/updated",
    params: {
      data: [
        { id: "sites", pluginDisplayNames: ["Sites"] },
        { id: "github", pluginDisplayNames: ["GitHub"] },
        { id: "documents", pluginDisplayNames: ["Spreadsheets"] },
      ],
    },
  });
  const result = await filterChunks([
    `${base}\n${enriched}\n${base}\n${enriched}\n`,
  ]);

  assert.equal(result.output, `${base}\n${enriched}\n`);
  assert.equal(result.suppressed, 2);
});

test("each newly observed plugin display name is forwarded at most once", async () => {
  const update = (pluginDisplayNames) => JSON.stringify({
    method: "app/list/updated",
    params: { data: [{ id: "one", pluginDisplayNames }] },
  });
  const base = update([]);
  const firstEnrichment = update(["One"]);
  const secondEnrichment = update(["One", "Uno"]);
  const staleEnrichment = update(["One"]);
  const result = await filterChunks([
    `${base}\n${firstEnrichment}\n${base}\n${secondEnrichment}\n${staleEnrichment}\n`,
  ]);

  assert.equal(
    result.output,
    `${base}\n${firstEnrichment}\n${secondEnrichment}\n`,
  );
  assert.equal(result.suppressed, 2);
});

test("a real catalog transition resets plugin display-name enrichment", async () => {
  const update = (enabled, pluginDisplayNames) => JSON.stringify({
    method: "app/list/updated",
    params: { data: [{ id: "one", enabled, pluginDisplayNames }] },
  });
  const first = update(true, []);
  const firstEnrichment = update(true, ["One"]);
  const changed = update(false, []);
  const changedEnrichment = update(false, ["One"]);
  const result = await filterChunks([
    `${first}\n${firstEnrichment}\n${changed}\n${changedEnrichment}\n`,
  ]);

  assert.equal(
    result.output,
    `${first}\n${firstEnrichment}\n${changed}\n${changedEnrichment}\n`,
  );
  assert.equal(result.suppressed, 0);
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

test("a burst of identical catalogs forwards only the first snapshot", async () => {
  const update = JSON.stringify({
    method: "app/list/updated",
    params: { data: [{ id: "one" }] },
  });
  const copies = 250;
  const result = await filterChunks([
    `${new Array(copies).fill(update).join("\n")}\n`,
  ]);

  assert.equal(result.output, `${update}\n`);
  assert.equal(result.suppressed, copies - 1);
});

test("malformed and unrelated output passes through unchanged", async () => {
  const input = "diagnostic app/list/updated text\n{not-json}\nfinal-line";
  const result = await filterChunks([input]);

  assert.equal(result.output, input);
  assert.equal(result.suppressed, 0);
});
