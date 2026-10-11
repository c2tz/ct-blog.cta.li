import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { hasDistinctModification } from "../src/lib/git-dates.mjs";

test("post modification visibility gives commit identity priority over displayed dates", () => {
  const createdCommit = "a".repeat(40);
  const dates = {
    createdAt: "2026-07-23T10:15:00.000Z",
    lastModified: "2026-07-23T10:15:00.000Z",
    createdCommit,
    lastModifiedCommit: createdCommit,
  };

  assert.equal(hasDistinctModification(dates), false);
  assert.equal(
    hasDistinctModification({ ...dates, lastModified: "2026-07-24T10:15:00.000Z" }),
    false,
    "the same commit must not produce a separate modification date",
  );
  assert.equal(
    hasDistinctModification({ ...dates, lastModifiedCommit: "b".repeat(40) }),
    true,
    "different commits record a modification even with identical timestamps",
  );
});

test("post modification visibility falls back to the displayed Paris calendar date", () => {
  const dates = {
    createdAt: "2026-07-23T10:15:00.000Z",
    lastModified: "2026-07-23T18:30:00.000Z",
  };

  assert.equal(hasDistinctModification(dates), false);
  assert.equal(hasDistinctModification({ ...dates, createdCommit: "a".repeat(40) }), false);
  assert.equal(hasDistinctModification({ ...dates, lastModifiedCommit: "b".repeat(40) }), false);
  assert.equal(
    hasDistinctModification({ ...dates, lastModified: "2026-07-23T22:30:00.000Z" }),
    true,
    "crossing midnight in Paris changes the displayed date, even within the same UTC day",
  );
  assert.equal(
    hasDistinctModification({
      createdAt: new Date("2026-07-23T22:15:00.000Z"),
      lastModified: "2026-07-24T10:15:00.000+02:00",
    }),
    false,
    "different date representations on the same Paris day must not create duplicates",
  );
});

test("getFileGitDates caches by resolved stat signature and invalidates after a file change", async () => {
  const initialCwd = process.cwd();
  const initialPath = process.env.PATH;
  const repository = await mkdtemp(path.join(os.tmpdir(), "git-dates-cache-"));

  try {
    process.chdir(repository);
    execFileSync("git", ["init", "--quiet"]);
    execFileSync("git", ["config", "user.name", "Cache Test"]);
    execFileSync("git", ["config", "user.email", "cache@example.test"]);

    const relativeFile = "post.md";
    const absoluteFile = path.join(repository, relativeFile);
    await writeFile(absoluteFile, "initial\n");
    execFileSync("git", ["add", relativeFile]);
    execFileSync("git", [
      "-c",
      "commit.gpgsign=false",
      "commit",
      "--quiet",
      "-m",
      "feat: add post",
    ]);

    const moduleUrl = new URL(`../src/lib/git-dates.mjs?cache-test=${Date.now()}`, import.meta.url);
    const { getFileGitDates } = await import(moduleUrl.href);
    const first = getFileGitDates(relativeFile);
    assert.match(first.createdCommit ?? "", /^[0-9a-f]{40}$/);
    assert.equal(first.lastModifiedCommit, first.createdCommit);

    process.env.PATH = "";
    const cached = getFileGitDates(absoluteFile);
    assert.deepEqual(cached, first);

    await writeFile(absoluteFile, "changed and larger\n");
    const changedAt = new Date(Date.now() + 2_000);
    await utimes(absoluteFile, changedAt, changedAt);

    const refreshed = getFileGitDates(relativeFile);
    assert.equal(refreshed.createdCommit, undefined);
    assert.equal(refreshed.lastModifiedCommit, undefined);
    assert.notEqual(refreshed.lastModified, cached.lastModified);
  } finally {
    process.env.PATH = initialPath;
    process.chdir(initialCwd);
    await rm(repository, { force: true, recursive: true });
  }
});

async function createRepository(t) {
  const initialCwd = process.cwd();
  const repository = await mkdtemp(path.join(os.tmpdir(), "git-dates-history-"));
  process.chdir(repository);
  t.after(async () => {
    process.chdir(initialCwd);
    await rm(repository, { force: true, recursive: true });
  });
  const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
  git("init", "--quiet");
  git("config", "user.name", "Dates Test");
  git("config", "user.email", "dates@example.test");
  const commit = (message, date) => {
    git("add", ".");
    execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", message], {
      env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
    });
    return git("rev-parse", "HEAD");
  };
  const module = await import(
    new URL(`../src/lib/git-dates.mjs?history=${repository}`, import.meta.url)
  );
  return { ...module, commit };
}

test("keeps the original creation across an article rename", async (t) => {
  const { getFileGitDates, commit } = await createRepository(t);
  await writeFile("post.md", "Original article.\n");
  const createdCommit = commit("feat: create article", "2025-01-01T12:00:00Z");
  await writeFile("post.md", "Updated article.\n");
  commit("feat: update article", "2025-02-01T12:00:00Z");
  await rename("post.md", "renamed.md");
  const renamedCommit = commit("refactor: rename article", "2025-03-01T12:00:00Z");

  assert.deepEqual(getFileGitDates("renamed.md"), {
    createdAt: "2025-01-01T12:00:00.000Z",
    createdCommit,
    lastModified: "2025-03-01T12:00:00.000Z",
    lastModifiedCommit: renamedCommit,
  });
});

test("invalidates cached dates when HEAD changes without another file write", async (t) => {
  const { getFileGitDates, commit } = await createRepository(t);
  await writeFile("post.md", "Original article.\n");
  const createdCommit = commit("feat: create article", "2025-01-01T12:00:00Z");
  await writeFile("post.md", "Updated article.\n");
  assert.equal(getFileGitDates("post.md").lastModifiedCommit, createdCommit);
  const before = await stat("post.md");
  const modifiedCommit = commit("feat: update article", "2025-02-01T12:00:00Z");
  const after = await stat("post.md");
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal(after.size, before.size);
  assert.equal(getFileGitDates("post.md").lastModifiedCommit, modifiedCommit);
});

test("keeps content commits ahead of pull-request summary commits", async (t) => {
  const { getFileGitDates, commit } = await createRepository(t);
  await writeFile("post.md", "Original article.\n");
  const original = commit("feat: create article", "2025-01-01T12:00:00Z");
  await writeFile("post.md", "Summary change.\n");
  commit("develop (#123)", "2025-02-01T12:00:00Z");
  assert.equal(getFileGitDates("post.md").lastModifiedCommit, original);
});

test("reports absent file dates and rejects a missing content entry explicitly", async (t) => {
  const { getFileGitDates, getContentEntryGitDates } = await createRepository(t);
  assert.equal(getFileGitDates("missing.md").createdAt, undefined);
  assert.equal(getFileGitDates("missing.md").lastModified, undefined);
  assert.throws(() => getContentEntryGitDates("blog", "missing"), /Cannot determine content dates/);
});
