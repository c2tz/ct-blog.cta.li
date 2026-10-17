import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function verifyProject(run, { lighthouse = false } = {}) {
  const results = [];
  const check = (script, env = {}) => {
    const passed = run(script, env) === 0;
    results.push({ script, status: passed ? "success" : "failure" });
    return passed;
  };
  const built = check("verify:quality:static");
  check("audit:dependencies");
  for (const script of ["test:e2e", ...(lighthouse ? ["test:lighthouse"] : [])]) {
    if (built) {
      check(script, { PLAYWRIGHT_REUSE_BUILD: "1" });
    } else {
      results.push({
        script,
        status: "skipped",
        reason: "Le build et les contrôles statiques doivent réussir.",
      });
    }
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const results = verifyProject(
    (script, env) => {
      console.info(`\nVérification : ${script}`);
      const result = spawnSync("pnpm", ["run", script], {
        stdio: "inherit",
        env: { ...process.env, ...env },
      });
      if (result.error) console.error(result.error.message);
      return result.status ?? 1;
    },
    { lighthouse: process.argv.includes("--lighthouse") },
  );
  console.info("\nRésultats des vérifications :");
  for (const { script, status, reason } of results) {
    console.info(`${script}: ${status}${reason ? ` — ${reason}` : ""}`);
  }
  process.exitCode = results.every(({ status }) => status === "success") ? 0 : 1;
}
