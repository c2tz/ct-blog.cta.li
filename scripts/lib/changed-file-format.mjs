import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, extname } from "node:path";

const SUPPORTED_EXTENSIONS = new Set([
  ".astro",
  ".css",
  ".html",
  ".js",
  ".json",
  ".jsonc",
  ".md",
  ".mdx",
  ".mjs",
  ".scss",
  ".ts",
  ".yaml",
  ".yml",
]);

export function selectFormattablePaths(paths) {
  return [...new Set(paths)].filter(
    (path) =>
      existsSync(path) &&
      (SUPPORTED_EXTENSIONS.has(extname(path).toLowerCase()) || /^README$/i.test(basename(path))),
  );
}

export function runPrettier(paths, { shouldWrite = false } = {}) {
  const result = spawnSync("prettier", [shouldWrite ? "--write" : "--check", ...paths], {
    stdio: "inherit",
  });
  return result.status ?? 1;
}
