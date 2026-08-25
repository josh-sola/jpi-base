import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "vite-plus/test";

import { Config } from "../src/config.ts";
import { type FieldValue, j } from "../src/builder.ts";

async function tempEnv(): Promise<NodeJS.ProcessEnv> {
  const directory = await mkdtemp(join(tmpdir(), "jpi-base-builder-"));
  return { PI_CODING_AGENT_DIR: directory };
}

// Exercises every builder construct in one schema: scalar fields, a scalar
// attr and an array attr, a nested node field, a list of scalars, and a list
// of nodes.
const roundTripSchema = j.node({
  fields: {
    name: j.string().describe("display name").default("default-name"),
    retries: j.number().int().nonnegative().describe("retry count").default(0),
    verbose: j.boolean().describe("verbose logging").default(false),
    endpoint: j.node({
      attrs: {
        scheme: j.string().describe("protocol").default("https"),
      },
      fields: {
        host: j.string().describe("hostname").default("localhost"),
      },
    }),
    tags: j.list(j.string(), { description: "arbitrary tags", default: [] }),
    route: j.list(
      j.node({ attrs: { hops: j.array(j.string()).describe("hop ids").default([]) } }),
      { description: "routing table", default: [] },
    ),
  },
});

test("round trip: encoded live values decode back to the same values", async () => {
  const env = await tempEnv();
  const config = new Config("roundtrip", roundTripSchema, env);

  const text = [
    "roundtrip {",
    '  name "custom"',
    "  retries 3",
    "  verbose #true",
    '  endpoint scheme="http" {',
    '    host "example.com"',
    "  }",
    '  tags "a"',
    '  tags "b"',
    '  route "x" "y"',
    '  route "z"',
    "}",
    "",
  ].join("\n");
  await writeFile(config.path, text, "utf8");

  const { value, issues } = await config.load();
  assert.deepEqual(issues, []);
  assert.deepEqual(value, {
    name: "custom",
    retries: 3,
    verbose: true,
    endpoint: { scheme: "http", host: "example.com" },
    tags: ["a", "b"],
    route: [{ hops: ["x", "y"] }, { hops: ["z"] }],
  });
});

test("round trip: an absent section decodes to the schema's own defaults", async () => {
  const env = await tempEnv();
  const config = new Config("roundtrip", roundTripSchema, env);

  const { value, issues } = await config.load();
  assert.deepEqual(issues, []);
  assert.deepEqual(value, {
    name: "default-name",
    retries: 0,
    verbose: false,
    endpoint: { scheme: "https", host: "localhost" },
    tags: [],
    route: [],
  });
});

test("Config throws when a field scalar has no default", () => {
  assert.throws(
    () => new Config("x", j.node({ fields: { a: j.string().describe("a") } })),
    /missing \.default\(\.\.\.\)/,
  );
});

test("Config throws when a field scalar has no description", () => {
  assert.throws(
    () => new Config("x", j.node({ fields: { a: j.string().default("v") } })),
    /missing \.describe\(\.\.\.\)/,
  );
});

test("j.node throws immediately when a node has two array attrs", () => {
  assert.throws(
    () =>
      j.node({
        attrs: {
          a: j.array(j.string()).describe("a").default([]),
          b: j.array(j.string()).describe("b").default([]),
        },
      }),
    /at most one array attr/,
  );
});

test("Config throws when a field is an unsupported schema construct", () => {
  // Deliberately outside the FieldValue contract, to exercise the runtime guard.
  assert.throws(
    () =>
      new Config("x", j.node({ fields: { a: j.string().optional() as unknown as FieldValue } })),
    /unsupported schema type "optional"/,
  );
  assert.throws(
    () =>
      new Config(
        "x",
        j.node({ fields: { a: j.string().or(j.number()) as unknown as FieldValue } }),
      ),
    /unsupported schema type "union"/,
  );
});

test("Config throws when a j.list is missing its description or default", () => {
  const noDescription = { default: [] } as unknown as { description: string; default: string[] };
  assert.throws(
    () => new Config("x", j.node({ fields: { a: j.list(j.string(), noDescription) } })),
    /j\.list requires a description/,
  );
  const noDefault = { description: "d" } as unknown as { description: string; default: string[] };
  assert.throws(
    () => new Config("x", j.node({ fields: { a: j.list(j.string(), noDefault) } })),
    /j\.list requires a default array/,
  );
});

const guardianSchema = j.node({
  fields: {
    model: j.string().describe("model that runs the reviews").default("anthropic/claude-sonnet-5"),
    enabled: j.boolean().describe("set to #false to disable reviews").default(true),
    timeoutMs: j
      .number()
      .int()
      .positive()
      .describe("per-review timeout in milliseconds")
      .default(10000),
    allow: j.node({
      fields: {
        tool: j.list(j.string(), {
          description: 'tool names that skip review (repeat: tool "name")',
          default: [],
        }),
        bash: j.list(j.string(), {
          description: "regexes; a full command match skips review",
          default: [],
        }),
      },
    }),
    policy: j.list(j.string(), { description: "extra review policy lines", default: [] }),
  },
});

const statusSchema = j.node({
  fields: {
    format: j.node({
      fields: {
        row: j.list(
          j.node({
            attrs: {
              components: j.array(j.string()).describe("component ids, left to right").default([]),
            },
          }),
          {
            description: "status line rows, top to bottom",
            default: [{ components: ["@jpi/model", "@jpi/cwd"] }],
          },
        ),
      },
    }),
    disabledStatuses: j.list(j.string(), { description: "built-in statuses to hide", default: [] }),
  },
});

test("stanza generation: guardian schema renders its exact live-default text", async () => {
  const env = await tempEnv();
  const config = new Config("guardian", guardianSchema, env);
  await config.load();

  const text = await readFile(config.path, "utf8");
  assert.equal(
    text,
    [
      "// jpi.kdl — config for all jpi plugins.",
      "// Sections are added by each plugin on first load.",
      "",
      "guardian {",
      "  // model that runs the reviews",
      '  model "anthropic/claude-sonnet-5"',
      "  // set to #false to disable reviews",
      "  enabled #true",
      "  // per-review timeout in milliseconds",
      "  timeout-ms 10000",
      "  allow {",
      '    // tool names that skip review (repeat: tool "name")',
      "    // regexes; a full command match skips review",
      "  }",
      "  // extra review policy lines",
      "}",
      "",
    ].join("\n"),
  );
});

test("stanza generation: status schema renders its exact live-default text", async () => {
  const env = await tempEnv();
  const config = new Config("status", statusSchema, env);
  await config.load();

  const text = await readFile(config.path, "utf8");
  assert.equal(
    text,
    [
      "// jpi.kdl — config for all jpi plugins.",
      "// Sections are added by each plugin on first load.",
      "",
      "status {",
      "  format {",
      "    // status line rows, top to bottom",
      '    row "@jpi/model" "@jpi/cwd"',
      "  }",
      "  // built-in statuses to hide",
      "}",
      "",
    ].join("\n"),
  );
});

test("status schema decodes to the documented shape", async () => {
  const env = await tempEnv();
  const config = new Config("status", statusSchema, env);
  const { value, issues } = await config.load();

  assert.deepEqual(issues, []);
  assert.deepEqual(value, {
    format: { row: [{ components: ["@jpi/model", "@jpi/cwd"] }] },
    disabledStatuses: [],
  });
});
