import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { htmlFilesIn } from "./file-listing.mjs";
import { parse } from "parse5";
import { getAttribute, walkElements } from "./html-nodes.mjs";

const JAVASCRIPT_SCRIPT_TYPES = new Set([
  "application/ecmascript",
  "application/javascript",
  "module",
  "text/ecmascript",
  "text/javascript",
]);

function isExecutableInlineScript(element) {
  if (element.tagName !== "script" || getAttribute(element, "src") !== undefined) return false;
  const type = (getAttribute(element, "type") ?? "").split(";")[0].trim().toLowerCase();

  return !type || JAVASCRIPT_SCRIPT_TYPES.has(type);
}

export async function collectExecutableInlineScriptHashes(directory) {
  const stats = await stat(directory).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new Error(`Built HTML directory missing: ${directory}. Run pnpm build first.`);
  }
  const files = await htmlFilesIn(directory);
  if (files.length === 0) {
    throw new Error(`No built HTML found in ${directory}. Run pnpm build first.`);
  }

  const hashes = new Set();

  for (const file of files) {
    const html = await readFile(file, "utf8");
    const document = parse(html);
    for (const element of walkElements(document)) {
      if (!isExecutableInlineScript(element)) continue;
      // CSP hashes the browser-parsed script text, including HTML newline normalization.
      const source = element.childNodes.map((node) => node.value ?? "").join("");
      hashes.add(`'sha256-${createHash("sha256").update(source).digest("base64")}'`);
    }
  }

  return [...hashes].sort();
}
