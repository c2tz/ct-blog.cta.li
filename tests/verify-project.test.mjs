import assert from "node:assert/strict";
import test from "node:test";
import { verifyProject } from "../scripts/verify-project.mjs";

test("an audit failure still runs browser checks and keeps the failing verdict", () => {
  const calls = [];
  const results = verifyProject((script, env) => {
    calls.push({ script, env });
    return script === "audit:dependencies" ? 1 : 0;
  });
  assert.equal(results.find((entry) => entry.script === "audit:dependencies").status, "failure");
  assert.equal(results.find((entry) => entry.script === "test:e2e").status, "success");
  assert.equal(calls.at(-1).env.PLAYWRIGHT_REUSE_BUILD, "1");
});

test("a failed build still audits dependencies but never tests stale output", () => {
  const calls = [];
  const results = verifyProject(
    (script) => {
      calls.push(script);
      return script === "verify:quality:static" ? 1 : 0;
    },
    { lighthouse: true },
  );
  assert.deepEqual(calls, ["verify:quality:static", "audit:dependencies"]);
  assert.equal(results.find((entry) => entry.script === "test:e2e").status, "skipped");
  assert.equal(results.find((entry) => entry.script === "test:lighthouse").status, "skipped");
});

test("the full verification reports Lighthouse even after a browser failure", () => {
  const results = verifyProject((script) => (script === "test:e2e" ? 1 : 0), { lighthouse: true });
  assert.equal(results.find((entry) => entry.script === "test:e2e").status, "failure");
  assert.equal(results.at(-1).script, "test:lighthouse");
  assert.equal(results.at(-1).status, "success");
});
