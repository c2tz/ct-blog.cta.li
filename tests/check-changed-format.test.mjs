import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { selectFormattablePaths } from "../scripts/lib/changed-file-format.mjs";

import {
  DEFAULT_FORMAT_BASE,
  EMPTY_TREE,
  formatDiffArguments,
  resolveFormatBase,
} from "../scripts/check-changed-format.mjs";

test("uses an explicit format base before a GitHub event", () => {
  const base = resolveFormatBase({
    formatBase: "origin/main",
    eventName: "push",
    event: { before: "a".repeat(40) },
  });

  assert.deepEqual(base, {
    baseRef: "origin/main",
    comparison: "merge-base",
    source: "FORMAT_BASE",
  });
  assert.deepEqual(formatDiffArguments(base), ["origin/main...HEAD"]);
});

test("uses the pull request base SHA with a merge-base comparison", () => {
  const baseSha = "a".repeat(40);
  const base = resolveFormatBase({
    eventName: "pull_request",
    event: { pull_request: { base: { sha: baseSha } } },
  });

  assert.deepEqual(base, {
    baseRef: baseSha,
    comparison: "merge-base",
    source: "pull request base SHA",
  });
  assert.deepEqual(formatDiffArguments(base), [`${baseSha}...HEAD`]);
});

test("uses the previous push SHA with a direct comparison", () => {
  const beforeSha = "b".repeat(40);
  const base = resolveFormatBase({
    eventName: "push",
    event: { before: beforeSha },
  });

  assert.deepEqual(base, {
    baseRef: beforeSha,
    comparison: "direct",
    source: "push before SHA",
  });
  assert.deepEqual(formatDiffArguments(base), [beforeSha, "HEAD"]);
});

test("checks every format-relevant file on a new push branch", () => {
  const base = resolveFormatBase({
    eventName: "push",
    event: { before: "0".repeat(40) },
  });

  assert.deepEqual(base, {
    baseRef: EMPTY_TREE,
    comparison: "direct",
    source: "empty tree for a new branch",
  });
  assert.deepEqual(formatDiffArguments(base), [EMPTY_TREE, "HEAD"]);
});

test("keeps the local develop comparison when no GitHub event is available", () => {
  const base = resolveFormatBase();

  assert.deepEqual(base, {
    baseRef: DEFAULT_FORMAT_BASE,
    comparison: "merge-base",
    source: "local default",
  });
});

test("rejects incomplete protected-event payloads", () => {
  assert.throws(
    () => resolveFormatBase({ eventName: "pull_request", event: { pull_request: { base: {} } } }),
    /does not contain a base commit SHA/,
  );
  assert.throws(
    () => resolveFormatBase({ eventName: "push", event: {} }),
    /does not contain its previous commit SHA/,
  );
});

function formatFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "ct-blog-format-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("selects documentation and source paths consistently, omitting deleted files and assets", (t) => {
  const directory = formatFixture(t);
  const paths = [
    "guide.md",
    "post.mdx",
    "page.astro",
    "app.js",
    "README",
    "UPPER.MD",
    "asset.avif",
  ].map((name) => join(directory, name));
  for (const path of paths) writeFileSync(path, "fixture");
  assert.deepEqual(
    selectFormattablePaths([...paths, paths[0], join(directory, "removed.md")]),
    paths.slice(0, -1),
  );
});

test("a mixed pull request formats changed Markdown and MDX without sweeping untouched content", (t) => {
  const directory = formatFixture(t);
  const git = (...args) => {
    const result = spawnSync("git", args, { cwd: directory, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const commit = (message) =>
    git(
      "-c",
      "user.name=Format Test",
      "-c",
      "user.email=format@example.invalid",
      "-c",
      "commit.gpgsign=false",
      "commit",
      "-m",
      message,
    );
  git("init", "-q");
  for (const name of ["untouched.md", "changed.md", "removed.md", "renamed.md", "app.js"]) {
    writeFileSync(join(directory, name), "initial\n");
  }
  git("add", ".");
  commit("initial");
  const baseSha = git("rev-parse", "HEAD");
  writeFileSync(join(directory, "changed.md"), "changed\n");
  writeFileSync(join(directory, "post.mdx"), "new post\n");
  writeFileSync(join(directory, "app.js"), "changed\n");
  git("rm", "removed.md");
  git("mv", "renamed.md", "renamed-post.md");
  git("add", ".");
  commit("mixed content and source");
  const headSha = git("rev-parse", "HEAD");
  const eventPath = join(directory, "event.json");
  writeFileSync(
    eventPath,
    JSON.stringify({ pull_request: { base: { sha: baseSha }, head: { sha: headSha } } }),
  );
  const bin = join(directory, "bin");
  mkdirSync(bin);
  const prettier = join(bin, "prettier");
  writeFileSync(prettier, '#!/bin/sh\nprintf "%s\\n" "$@"\n');
  chmodSync(prettier, 0o755);
  const result = spawnSync(process.execPath, [resolve("scripts/check-changed-format.mjs")], {
    cwd: directory,
    encoding: "utf8",
    env: {
      ...process.env,
      FORMAT_BASE: "",
      GITHUB_EVENT_NAME: "pull_request",
      GITHUB_EVENT_PATH: eventPath,
      PATH: `${bin}:${process.env.PATH}`,
    },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.stdout.trim().split("\n").sort(),
    ["--check", "app.js", "changed.md", "event.json", "post.mdx", "renamed-post.md"].sort(),
  );
});
