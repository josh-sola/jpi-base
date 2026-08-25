import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vite-plus/test";

import { Store } from "../src/store.ts";

async function tempEnv(): Promise<NodeJS.ProcessEnv> {
  const directory = await mkdtemp(join(tmpdir(), "jpi-base-store-"));
  return { PI_CODING_AGENT_DIR: directory };
}

test("path namespaces the file under <extension>-<file> inside the jpi directory", async () => {
  const store = new Store("guardian", await tempEnv());
  assert.match(store.path("state.json"), /\/jpi\/guardian-state\.json$/);
});

test("reading a missing file reports missing rather than a problem", async () => {
  const store = new Store("guardian", await tempEnv());
  assert.deepEqual(await store.read("state.json"), { missing: true });
});

test("reading malformed JSON reports a problem", async () => {
  const env = await tempEnv();
  const store = new Store("guardian", env);
  await mkdir(join(env.PI_CODING_AGENT_DIR as string, "jpi"), { recursive: true });
  await writeFile(store.path("state.json"), "{not json", "utf8");

  const result = await store.read("state.json");
  assert.ok("problem" in result);
  assert.match((result as { problem: string }).problem, /^invalid JSON: /);
});

test("write then read round-trips the value, and remove deletes it", async () => {
  const store = new Store("guardian", await tempEnv());
  const value = { enabled: true, items: ["a", "b"] };

  await store.write("state.json", value);
  assert.deepEqual(await store.read("state.json"), { value });

  const written = await readFile(store.path("state.json"), "utf8");
  assert.equal(written, `${JSON.stringify(value, null, 2)}\n`);

  assert.equal(await store.remove("state.json"), undefined);
  assert.deepEqual(await store.read("state.json"), { missing: true });
});

test("removing a file that doesn't exist is a no-op", async () => {
  const store = new Store("guardian", await tempEnv());
  assert.equal(await store.remove("state.json"), undefined);
});

test("write cleans up its temp file when the final rename fails", async () => {
  const env = await tempEnv();
  const store = new Store("guardian", env);

  // Pre-create the target as a directory so the rename in write() fails.
  await mkdir(store.path("state.json"), { recursive: true });

  await assert.rejects(() => store.write("state.json", { a: 1 }));

  const entries = await readdir(join(env.PI_CODING_AGENT_DIR as string, "jpi"));
  assert.deepEqual(entries, ["guardian-state.json"]);
});

test("extension and file names are validated", async () => {
  const env = await tempEnv();
  assert.throws(() => new Store(".hidden", env), /invalid extension name/);
  assert.throws(() => new Store("has space", env), /invalid extension name/);

  const store = new Store("guardian", env);
  assert.throws(() => store.path(".hidden"), /invalid file name/);
  assert.throws(() => store.path("has space"), /invalid file name/);
});
