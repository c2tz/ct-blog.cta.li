import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assessAudit,
  auditMarkdown,
  findUnpublishedFixes,
} from "../scripts/audit-dependencies.mjs";

const policy = JSON.parse(
  readFileSync(new URL("../dependency-audit-policy.json", import.meta.url)),
);
const now = new Date("2026-10-10T12:00:00Z");
const exception = policy.exceptions[0];
const advisory = {
  github_advisory_id: exception.id,
  module_name: exception.package,
  severity: "high",
  url: `https://github.com/advisories/${exception.id}`,
  patched_versions: null,
  findings: [{ dev: true, version: exception.version, paths: [...exception.paths] }],
};
function report(entry = advisory) {
  const vulnerabilities = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  vulnerabilities[entry.severity] = 1;
  return { advisories: { 1: entry }, metadata: { vulnerabilities } };
}

test("accepts only the documented unpatched development path before its expiry", () => {
  const result = assessAudit(report(), policy, now, new Set([exception.id]));
  assert.equal(result.accepted.length, 1);
  assert.equal(result.blocking.length, 0);
  const markdown = auditMarkdown(result);
  assert.match(markdown, /1 exception/);
  assert.ok(markdown.includes(exception.id));
  assert.ok(markdown.includes(exception.reason));
  assert.ok(markdown.includes(exception.paths[0]));
  assert.ok(markdown.includes(exception.expiresOn));
});

test("blocks expired exceptions, changed versions, production paths and changed fix ranges", () => {
  for (const changed of [
    { ...advisory, github_advisory_id: "GHSA-new-advisory" },
    { ...advisory, severity: "critical" },
    { ...advisory, patched_versions: ">=4.0.0" },
    { ...advisory, findings: [{ ...advisory.findings[0], dev: false }] },
    { ...advisory, findings: [{ ...advisory.findings[0], version: "3.0.2" }] },
    { ...advisory, findings: [{ ...advisory.findings[0], paths: [".>astro>braces"] }] },
    { ...advisory, findings: [] },
  ]) {
    const result = assessAudit(report(changed), policy, now, new Set([exception.id]));
    assert.equal(result.blocking.length, 1);
    assert.equal(result.accepted.length, 0);
  }
  const result = assessAudit(
    report(),
    policy,
    new Date(`${exception.expiresOn}T00:00:00Z`),
    new Set([exception.id]),
  );
  assert.equal(result.blocking.length, 1);
});

test("a second dependency path cannot inherit an exception for the first", () => {
  const changed = structuredClone(advisory);
  changed.findings[0].paths.push(".>unreviewed-tool>braces");
  assert.equal(
    assessAudit(report(changed), policy, now, new Set([exception.id])).blocking.length,
    1,
  );
});

test("registry failures and incomplete reports remain blocking rather than reporting zero risks", () => {
  for (const input of [
    { error: "registry timeout" },
    {},
    { advisories: {} },
    { ...report(), advisories: {} },
    { advisories: {}, metadata: { vulnerabilities: {} } },
    { advisories: [], metadata: { vulnerabilities: [] } },
    {
      ...report(),
      metadata: { vulnerabilities: { ...report().metadata.vulnerabilities, unknown: 1 } },
    },
    {
      ...report(),
      metadata: { vulnerabilities: { ...report().metadata.vulnerabilities, high: "1" } },
    },
    report({ ...advisory, patched_versions: undefined }),
    report({ ...advisory, patched_versions: "not a version range" }),
    report({ ...advisory, findings: [{ ...advisory.findings[0], paths: "path" }] }),
  ]) {
    assert.throws(() => assessAudit(input, policy, now));
  }
  assert.throws(() => assessAudit(report(), {}, now));
  assert.equal(
    assessAudit(
      {
        advisories: {},
        metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } },
      },
      policy,
      now,
    ).blocking.length,
    0,
  );
});

test("an announced fix is accepted only after checking the published versions", async () => {
  const announced = { ...advisory, patched_versions: exception.unpublishedPatchedRange };
  const metadata = (versions) => async (url) => {
    assert.equal(url, `https://registry.npmjs.org/${exception.package}`);
    return { ok: true, json: async () => ({ versions }) };
  };
  const unavailable = await findUnpublishedFixes(
    [announced],
    policy,
    now,
    metadata({ "3.0.3": {} }),
  );
  assert.equal(assessAudit(report(announced), policy, now, unavailable).accepted.length, 1);
  const available = await findUnpublishedFixes(
    [announced],
    policy,
    now,
    metadata({ "3.0.3": {}, "3.0.5": {} }),
  );
  assert.equal(assessAudit(report(announced), policy, now, available).blocking.length, 1);
  assert.equal(assessAudit(report(announced), policy, now).blocking.length, 1);
  const omittedFix = await findUnpublishedFixes([advisory], policy, now, metadata({ "3.0.4": {} }));
  assert.equal(assessAudit(report(), policy, now, omittedFix).blocking.length, 1);
  const unpublishedNull = await findUnpublishedFixes(
    [advisory],
    policy,
    now,
    metadata({ "3.0.3": {} }),
  );
  assert.equal(assessAudit(report(), policy, now, unpublishedNull).accepted.length, 1);
});

test("unavailable or malformed package metadata cannot justify an exception", async () => {
  const announced = { ...advisory, patched_versions: exception.unpublishedPatchedRange };
  for (const response of [
    { ok: false, status: 503 },
    { ok: true, json: async () => ({}) },
    { ok: true, json: async () => ({ versions: {} }) },
    { ok: true, json: async () => ({ versions: [] }) },
    { ok: true, json: async () => ({ versions: { invalid: {} } }) },
  ]) {
    await assert.rejects(findUnpublishedFixes([announced], policy, now, async () => response));
  }
  const outsideScope = { ...announced, findings: [{ ...advisory.findings[0], dev: false }] };
  const result = await findUnpublishedFixes([outsideScope], policy, now, () =>
    assert.fail("Unreviewed exposure must remain blocking without a registry lookup"),
  );
  assert.equal(result.size, 0);
});
