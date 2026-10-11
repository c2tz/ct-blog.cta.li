import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { collectExecutableInlineScriptHashes } from "../scripts/lib/inline-script-hashes.mjs";

const hash = (source) => `'sha256-${createHash("sha256").update(source).digest("base64")}'`;

async function directory(t) {
  const root = await mkdtemp(join(tmpdir(), "ct-blog-inline-hashes-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

test("hashes browser-parsed script text without trimming or serializing it", async (t) => {
  const root = await directory(t);
  const source = '\r\nconsole.info("<&amp;>");\r\n';
  await writeFile(
    join(root, "index.html"),
    `<!doctype html>
    <!-- <script>commentedOut()</script> -->
    <script src = "/external.js">externalFallback()</script>
    <script type="application/ld+json">{"ignored":true}</script>
    <script data-src="metadata">${source}</script>
    <SCRIPT TYPE = "text/javascript; charset=utf-8">second()</SCRIPT>
    <script type="module">moduleScript()</script>`,
  );
  assert.deepEqual(
    await collectExecutableInlineScriptHashes(root),
    [hash(source.replaceAll("\r\n", "\n")), hash("second()"), hash("moduleScript()")].sort(),
  );
});

test("fails on absent or empty build directories, but allows HTML without inline JavaScript", async (t) => {
  const root = await directory(t);
  await assert.rejects(
    collectExecutableInlineScriptHashes(join(root, "missing")),
    /Run pnpm build first/,
  );
  await assert.rejects(collectExecutableInlineScriptHashes(root), /No built HTML/);
  await writeFile(join(root, "index.html"), "<!doctype html><h1>No scripts</h1>");
  assert.deepEqual(await collectExecutableInlineScriptHashes(root), []);
});

test("check:headers refuses missing build output before reporting policy readiness", async (t) => {
  const root = await directory(t);
  await copyFile(new URL("../vercel.json", import.meta.url), join(root, "vercel.json"));
  const script = fileURLToPath(new URL("../scripts/check-security-headers.mjs", import.meta.url));
  const run = () => execFileSync(process.execPath, [script], { cwd: root, stdio: "pipe" });
  assert.throws(run, /Built HTML directory missing/);
  await mkdir(join(root, "dist"));
  assert.throws(run, /No built HTML/);
});
