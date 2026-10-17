import { execFileSync } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import { formatFrenchDate } from "./date-format.mjs";

const cwd = process.cwd();
const CONTENT_EXTENSIONS = [".md", ".mdx"];
const GIT_LOG_FORMAT = "%H%x1f%aI%x1f%s%x1f%P";
const gitDatesCache = new Map();
let lastKnownHead;

function readGit(args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

function getHeadRevision() {
  try {
    lastKnownHead = readGit(["rev-parse", "HEAD"]);
  } catch {
    // Preserve the filesystem cache when Git temporarily becomes unavailable.
  }
  return lastKnownHead;
}

export function hasDistinctModification({
  createdAt,
  createdCommit,
  lastModified,
  lastModifiedCommit,
}) {
  if (createdCommit && lastModifiedCommit) return createdCommit !== lastModifiedCommit;

  return formatFrenchDate(createdAt) !== formatFrenchDate(lastModified);
}

function getFileSignature(filePath) {
  try {
    const stats = statSync(filePath);
    return `${filePath}\0${stats.mtimeMs}\0${stats.size}`;
  } catch {
    return `${filePath}\0missing`;
  }
}

function resolveFilePath(filePath) {
  const resolvedPath = resolve(cwd, filePath);
  try {
    return realpathSync(resolvedPath);
  } catch {
    return resolvedPath;
  }
}

function isPullRequestSummaryCommit(subject = "") {
  return (
    /^(develop|main|master|release|staging|production)\s+\(#\d+\)$/i.test(subject) ||
    /^Merge pull request #\d+ from /i.test(subject)
  );
}

function normalizeDate(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date.toISOString();
}

function getFileHistory(filePath) {
  try {
    // --follow must traverse newest first to discover former paths at renames.
    const history = readGit([
      "log",
      "--follow",
      `--format=${GIT_LOG_FORMAT}`,
      "--",
      relative(cwd, filePath),
    ])
      .split(/\r?\n/)
      .map((line) => {
        const [commit, date, subject = "", parents = ""] = line.split("\x1f");
        return { commit, date, subject, isMerge: parents.includes(" ") };
      })
      .filter(({ commit, date }) => commit && date);
    const contentHistory = history.filter(({ subject }) => !isPullRequestSummaryCommit(subject));
    const nonMergeHistory = contentHistory.filter(({ isMerge }) => !isMerge);
    return nonMergeHistory.length
      ? nonMergeHistory
      : contentHistory.length
        ? contentHistory
        : history;
  } catch {
    return [];
  }
}

function getFileSystemDates(filePath) {
  try {
    const stats = statSync(filePath);
    return {
      createdAt: normalizeDate(stats.birthtime),
      lastModified: normalizeDate(stats.mtime),
    };
  } catch {
    return {};
  }
}

export function getFileGitDates(filePath) {
  const resolvedPath = resolveFilePath(filePath);
  const signature = getFileSignature(resolvedPath);
  const head = getHeadRevision();
  const cached = gitDatesCache.get(resolvedPath);
  if (cached?.signature === signature && cached.head === head) return { ...cached.dates };

  const history = getFileHistory(resolvedPath);
  const created = history.at(-1);
  const modified = history[0];
  const fileSystemDates = getFileSystemDates(resolvedPath);

  const dates = {
    createdAt:
      normalizeDate(created?.date) || fileSystemDates.createdAt || fileSystemDates.lastModified,
    createdCommit: created?.commit,
    lastModified:
      normalizeDate(modified?.date) ||
      normalizeDate(created?.date) ||
      fileSystemDates.lastModified ||
      fileSystemDates.createdAt,
    lastModifiedCommit: modified?.commit,
  };
  gitDatesCache.set(resolvedPath, { dates, head, signature: getFileSignature(resolvedPath) });
  return { ...dates };
}

function resolveContentEntryPath(collection, entry) {
  const entryPath = entry?.filePath || entry?.slug || entry?.id || entry;
  const id = String(entryPath || "");

  if (id && existsSync(resolve(cwd, id))) {
    return resolve(cwd, id);
  }

  const base = resolve(cwd, "src/content", collection);
  const normalizedId = id.replace(/\.(md|mdx)$/i, "");

  for (const extension of CONTENT_EXTENSIONS) {
    const candidate = resolve(base, `${normalizedId}${extension}`);
    if (existsSync(candidate)) return candidate;
  }

  for (const extension of CONTENT_EXTENSIONS) {
    const candidate = resolve(base, normalizedId, `index${extension}`);
    if (existsSync(candidate)) return candidate;
  }

  return resolve(base, `${normalizedId}.md`);
}

export function getContentEntryGitDates(collection, entry) {
  const filePath = resolveContentEntryPath(collection, entry);
  const dates = getFileGitDates(filePath);
  if (!dates.createdAt || !dates.lastModified) {
    throw new Error(`Cannot determine content dates for ${filePath}`);
  }
  return dates;
}
