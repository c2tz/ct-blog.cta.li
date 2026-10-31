import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

// Resolve the transitive package from a real legacy consumer, without relying on pnpm paths.
const eslintRequire = createRequire(import.meta.resolve("eslint"));
const commonjs = eslintRequire("minimatch");
const packagePath = eslintRequire.resolve("minimatch/package.json");
const metadata = JSON.parse(readFileSync(packagePath, "utf8"));
const esm = await import(
  new URL(metadata.exports["."].import.default, pathToFileURL(packagePath)).href
);

for (const [name, matcher] of [
  ["legacy CommonJS", commonjs],
  ["legacy ESM default", esm.default],
  ["modern named export", esm.minimatch],
]) {
  test(`${name} preserves the glob API used by ESLint and its plugins`, () => {
    assert.equal(matcher("src/post.ts", "**/*.{js,ts}"), true);
    assert.equal(matcher("src/post.png", "**/*.{js,ts}"), false);
    assert.equal(matcher(".config.js", "*.js"), false);
    assert.equal(matcher.defaults({ dot: true })(".config.js", "*.js"), true);
    assert.deepEqual(matcher.match(["a.ts", "b.js", "c.png"], "*.{js,ts}"), ["a.ts", "b.js"]);
    assert.equal(new matcher.Minimatch("src/**", { dot: true }).match("src/.hidden/x.ts"), true);
  });
}

test("glob preprocessing stays bounded with the official amplification fix", () => {
  // A subprocess timeout also catches a regression that blocks the event loop.
  const script = `
    const { Minimatch } = require(process.argv[1]);
    const matcher = new Minimatch('**/../a/b/'.repeat(16) + 'target', {
      optimizationLevel: 2,
      braceExpandMax: 32,
    });
    process.stdout.write(String(matcher.set.length));
  `;
  const output = execFileSync(
    process.execPath,
    ["-e", script, eslintRequire.resolve("minimatch")],
    {
      encoding: "utf8",
      timeout: 5000,
    },
  );
  assert.ok(Number(output) > 0 && Number(output) <= 32);
});

test("LHCI loads the newer Chrome launcher through its CommonJS consumer", () => {
  const require = createRequire(import.meta.url);
  const { determineChromePath } = require("@lhci/cli/src/utils.js");
  assert.equal(determineChromePath({ chromePath: "/fixture/chrome" }), "/fixture/chrome");
});
