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

test("projectSlug dashes characters a Store path segment can't hold", () => {
  assert.equal(projectSlug("/Users/josh/My Repos"), "-Users-josh-My-Repos");
  assert.equal(projectSlug("/Users/josh/repos:x"), "-Users-josh-repos-x");
});
