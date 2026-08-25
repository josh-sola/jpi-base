import assert from "node:assert/strict";
import { test } from "vite-plus/test";

import { projectSlug } from "../src/project-slug.ts";

test("projectSlug replaces every path separator with a dash", () => {
  assert.equal(projectSlug("/Users/josh/repos/x"), "-Users-josh-repos-x");
});

test("projectSlug keeps the leading dash from a leading slash", () => {
  assert.equal(projectSlug("/a"), "-a");
});

test("projectSlug on the root path", () => {
  assert.equal(projectSlug("/"), "-");
});
