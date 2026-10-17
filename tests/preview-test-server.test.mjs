import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("../scripts/preview-test-server.mjs", import.meta.url));

async function fixture(t, { build = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "ct-blog-preview-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(
    join(root, "astro.config.mjs"),
    `export default {
    trailingSlash: "never",
    vite: { preview: { headers: { "X-Test-Preview": "preserved" } } }
  };`,
  );
  if (build) {
    await mkdir(join(root, "dist/article"), { recursive: true });
    await writeFile(join(root, "dist/index.html"), "<!doctype html><h1>Preview fixture</h1>");
    await writeFile(
      join(root, "dist/article/index.html"),
      "<!doctype html><h1>Article fixture</h1>",
    );
  }
  return root;
}

async function listen(port = 0) {
  const server = createServer();
  server.listen(port, "127.0.0.1");
  await once(server, "listening");
  return server;
}

async function availablePort() {
  const server = await listen();
  const { port } = server.address();
  await new Promise((resolve) => {
    server.close(resolve);
  });
  return port;
}

function launch(t, root, port) {
  const child = spawn(process.execPath, [script, "--port", String(port)], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const exited = once(child, "exit");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
  });
  return { child, exited, output: () => output };
}

async function ready(server, port) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (server.child.exitCode !== null || server.child.signalCode !== null) {
      throw new Error(`Preview exited before readiness: ${server.output()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/article`);
      if (response.ok) return response;
    } catch {
      /* The process may still be starting. */
    }
    await delay(25);
  }
  throw new Error(`Preview did not become ready: ${server.output()}`);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  test(
    `serves configured routes in the foreground and releases its port after ${signal}`,
    { timeout: 15_000 },
    async (t) => {
      const root = await fixture(t);
      const port = await availablePort();
      const server = launch(t, root, port);
      const response = await ready(server, port);
      assert.equal(response.headers.get("x-test-preview"), "preserved");
      assert.match(await response.text(), /Article fixture/);
      assert.equal(server.child.exitCode, null);
      server.child.kill(signal);
      const [code, exitSignal] = await server.exited;
      assert.equal(code, 0, server.output());
      assert.equal(exitSignal, null);
      const released = await listen(port);
      await new Promise((resolve) => {
        released.close(resolve);
      });
    },
  );
}

test(
  "fails instead of switching ports when the configured port is occupied",
  { timeout: 15_000 },
  async (t) => {
    const root = await fixture(t);
    const occupied = await listen();
    t.after(
      () =>
        new Promise((resolve) => {
          occupied.close(resolve);
        }),
    );
    const server = launch(t, root, occupied.address().port);
    const [code] = await server.exited;
    assert.equal(code, 1, server.output());
    assert.match(server.output(), /already in use|EADDRINUSE/i);
  },
);

test("exits with failure when there is no build to preview", { timeout: 15_000 }, async (t) => {
  const root = await fixture(t, { build: false });
  const server = launch(t, root, await availablePort());
  const [code] = await server.exited;
  assert.equal(code, 1, server.output());
  assert.match(server.output(), /output directory .* does not exist/);
});
