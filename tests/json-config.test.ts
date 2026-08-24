import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadJsonConfig, saveJsonConfig } from "../src/json-config.ts";

function missingFileError(path: string) {
  return Object.assign(new Error(`ENOENT: ${path}`), { code: "ENOENT" });
}

test("loading treats a missing file as missing rather than a problem", async () => {
  const path = "/config/settings.json";
  const result = await loadJsonConfig(path, async () => {
    throw missingFileError(path);
  });
  assert.deepEqual(result, { missing: true });
});

test("loading reports unreadable files as a problem", async () => {
  const result = await loadJsonConfig("/config/settings.json", async () => {
    throw new Error("permission denied");
  });
  assert.deepEqual(result, { problem: "could not read config: permission denied" });
});

test("loading reports malformed JSON as a problem", async () => {
  const result = await loadJsonConfig("/config/settings.json", async () => "{");
  assert.match((result as { problem: string }).problem, /^invalid JSON: /);
});

test("loading returns the parsed value on success", async () => {
  const result = await loadJsonConfig("/config/settings.json", async () =>
    JSON.stringify({ enabled: true, count: 3 }));
  assert.deepEqual(result, { value: { enabled: true, count: 3 } });
});

test("saving writes pretty-printed JSON with a trailing newline and round-trips through loading", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jpi-base-"));
  try {
    const path = join(directory, "nested", "settings.json");
    const value = { enabled: true, items: ["a", "b"] };

    await saveJsonConfig(path, value);

    const written = await readFile(path, "utf8");
    assert.equal(written, `${JSON.stringify(value, null, 2)}\n`);

    const loaded = await loadJsonConfig(path);
    assert.deepEqual(loaded, { value });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("saving creates missing parent directories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jpi-base-"));
  try {
    const path = join(directory, "a", "b", "c", "settings.json");
    await saveJsonConfig(path, { ok: true });
    assert.deepEqual(JSON.parse(await readFile(path, "utf8")), { ok: true });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
