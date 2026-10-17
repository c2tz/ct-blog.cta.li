import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { satisfies, valid, validRange } from "semver";

function matchesExposure(exception, advisory, now) {
  return (
    exception.id === advisory.github_advisory_id &&
    exception.package === advisory.module_name &&
    exception.severity === advisory.severity &&
    /^\d{4}-\d{2}-\d{2}$/.test(exception.expiresOn) &&
    now < new Date(`${exception.expiresOn}T00:00:00Z`) &&
    Boolean(exception.reason?.trim() && exception.removeWhen?.trim()) &&
    Array.isArray(exception.paths) &&
    advisory.findings.length > 0 &&
    advisory.findings.every(
      (finding) =>
        finding.dev === true &&
        finding.version === exception.version &&
        finding.paths?.length > 0 &&
        finding.paths.every((path) => exception.paths.includes(path)),
    )
  );
}

const severities = ["info", "low", "moderate", "high", "critical"];
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const matchesPatchRange = (exception, advisory) =>
  typeof exception.unpublishedPatchedRange === "string" &&
  validRange(exception.unpublishedPatchedRange) &&
  (advisory.patched_versions === null ||
    exception.unpublishedPatchedRange === advisory.patched_versions);

export function assessAudit(report, policy, now = new Date(), unpublishedFixes = new Set()) {
  const counts = report?.metadata?.vulnerabilities;
  if (
    report?.error ||
    !isObject(report?.advisories) ||
    !isObject(counts) ||
    Object.keys(counts).length !== severities.length ||
    !severities.every(
      (severity) =>
        Object.hasOwn(counts, severity) &&
        Number.isSafeInteger(counts[severity]) &&
        counts[severity] >= 0,
    ) ||
    !Array.isArray(policy?.exceptions)
  ) {
    throw new Error("Réponse npm ou politique d’audit invalide : le contrôle reste bloquant.");
  }
  const advisories = Object.values(report.advisories);
  if (
    severities.some(
      (severity) =>
        advisories.filter((entry) => entry?.severity === severity).length !== counts[severity],
    )
  ) {
    throw new Error("Réponse npm incohérente : le nombre d’avis ne correspond pas au rapport.");
  }
  const accepted = [];
  const blocking = [];
  for (const advisory of advisories) {
    if (
      typeof advisory?.github_advisory_id !== "string" ||
      typeof advisory.module_name !== "string" ||
      !severities.includes(advisory.severity) ||
      !(
        advisory.patched_versions === null ||
        (typeof advisory.patched_versions === "string" && validRange(advisory.patched_versions))
      ) ||
      !Array.isArray(advisory.findings) ||
      !advisory.findings.every(
        (finding) =>
          isObject(finding) &&
          typeof finding.dev === "boolean" &&
          typeof finding.version === "string" &&
          Array.isArray(finding.paths) &&
          finding.paths.every((path) => typeof path === "string"),
      )
    ) {
      throw new Error("Avis npm incomplet : impossible de vérifier son exposition.");
    }
    const exception = policy.exceptions.find(
      (entry) =>
        matchesExposure(entry, advisory, now) &&
        matchesPatchRange(entry, advisory) &&
        unpublishedFixes.has(advisory.github_advisory_id),
    );
    if (exception) accepted.push({ advisory, exception });
    else blocking.push(advisory);
  }
  return { accepted, blocking };
}

export async function findUnpublishedFixes(
  advisories,
  policy,
  now = new Date(),
  fetchMetadata = fetch,
) {
  const unpublished = new Set();
  for (const advisory of advisories) {
    const exception = policy.exceptions.find(
      (entry) => matchesExposure(entry, advisory, now) && matchesPatchRange(entry, advisory),
    );
    if (!exception) continue;
    const response = await fetchMetadata(
      `https://registry.npmjs.org/${encodeURIComponent(advisory.module_name)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) throw new Error(`Registre ${advisory.module_name} : HTTP ${response.status}`);
    const metadata = await response.json();
    if (
      !isObject(metadata.versions) ||
      !Object.keys(metadata.versions).length ||
      !Object.keys(metadata.versions).every((version) => valid(version))
    ) {
      throw new Error(`Versions publiées de ${advisory.module_name} invalides.`);
    }
    if (
      !Object.keys(metadata.versions).some((version) =>
        satisfies(version, exception.unpublishedPatchedRange),
      )
    ) {
      unpublished.add(advisory.github_advisory_id);
    }
  }
  return unpublished;
}

const cell = (value) =>
  String(value ?? "—")
    .replaceAll("|", "\\|")
    .replaceAll(/\r?\n/g, " ");

export function auditMarkdown({ accepted, blocking }) {
  const lines = [
    "# Audit des dépendances",
    "",
    `${blocking.length} avis bloquant(s), ${accepted.length} exception(s) temporaire(s).`,
    "Le rapport JSON conserve tous les avis, y compris les exceptions.",
    "",
    "| Paquet | Gravité | Avis | Plage corrigée annoncée | Décision |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const advisory of blocking) {
    lines.push(
      `| ${cell(advisory.module_name)} | ${cell(advisory.severity)} | [${cell(advisory.github_advisory_id)}](${advisory.url}) | ${cell(advisory.patched_versions)} | Bloquant |`,
    );
  }
  for (const { advisory, exception } of accepted) {
    lines.push(
      `| ${cell(advisory.module_name)} | ${cell(advisory.severity)} | [${cell(advisory.github_advisory_id)}](${advisory.url}) | ${cell(advisory.patched_versions)} | Aucun correctif publié ; exception jusqu’au ${exception.expiresOn} |`,
    );
  }
  for (const advisory of [...blocking, ...accepted.map((entry) => entry.advisory)]) {
    lines.push("", `## ${advisory.github_advisory_id} — ${advisory.module_name}`, "");
    for (const finding of advisory.findings) {
      for (const path of finding.paths ?? []) lines.push(`- ${finding.version} : \`${path}\``);
    }
    const exception = accepted.find((entry) => entry.advisory === advisory)?.exception;
    if (exception) {
      lines.push("", exception.reason, "", `À retirer lorsque : ${exception.removeWhen}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const directory = resolve("reports");
  await mkdir(directory, { recursive: true });
  let raw = "";
  try {
    const policy = JSON.parse(await readFile("dependency-audit-policy.json", "utf8"));
    const result = spawnSync("pnpm", ["audit", "--audit-level", "low", "--json"], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 120_000,
    });
    raw = result.stdout || "";
    if (result.error || ![0, 1].includes(result.status)) {
      throw new Error(
        result.error?.message || result.stderr || `pnpm audit : code ${result.status}`,
      );
    }
    const report = JSON.parse(raw);
    // Preserve the original registry response, including explicitly accepted risks.
    await writeFile(resolve(directory, "dependency-audit.json"), raw);
    const now = new Date();
    const initialVerdict = assessAudit(report, policy, now);
    const unpublishedFixes = await findUnpublishedFixes(initialVerdict.blocking, policy, now);
    const verdict = assessAudit(report, policy, now, unpublishedFixes);
    if (result.status === 1 && !Object.keys(report.advisories).length) {
      throw new Error("pnpm audit a échoué sans fournir d’avis exploitable.");
    }
    await writeFile(resolve(directory, "dependency-audit.md"), auditMarkdown(verdict));
    console.info(
      `Audit : ${verdict.blocking.length} avis bloquant(s), ${verdict.accepted.length} exception(s) temporaire(s). Rapports : reports/dependency-audit.{json,md}`,
    );
    for (const { advisory, exception } of verdict.accepted) {
      console.warn(
        `${advisory.github_advisory_id} (${advisory.module_name}) : exception jusqu’au ${exception.expiresOn}.`,
      );
    }
    process.exitCode = verdict.blocking.length ? 1 : 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Registry/network failures must never look like a vulnerability-free result.
    await writeFile(
      resolve(directory, "dependency-audit.json"),
      JSON.stringify({ error: message, output: raw }, null, 2),
    );
    await writeFile(
      resolve(directory, "dependency-audit.md"),
      `# Audit indisponible\n\n${message}\n\nLe contrôle reste bloquant. Relancer \`pnpm audit:dependencies\`.\n`,
    );
    console.error(`Audit indisponible : ${message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await main();
}
