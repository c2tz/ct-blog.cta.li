import { parseArgs } from "node:util";
import { preview } from "astro";

function reportFailure(error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function main() {
  const { values } = parseArgs({ options: { port: { type: "string", default: "4322" } } });
  const port = Number(values.port);
  if (!/^\d+$/.test(values.port) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("The test preview port must be an integer between 1 and 65535.");
  }

  // The public API keeps this process alive even when Astro's CLI detects an agent.
  // It still loads astro.config.mjs, including routing, headers and the media proxy.
  const server = await preview({
    server: { host: "127.0.0.1", port, open: false },
    vite: { preview: { strictPort: true } },
  });
  // Match the production /_astro/ rule in vercel.json for content-hashed assets.
  // Astro excludes user Vite plugins from preview, so set this before its handler.
  server.server.prependListener("request", (request, response) => {
    const pathname = URL.parse(request.url ?? "/", "http://localhost")?.pathname;
    if (pathname?.startsWith("/_astro/")) {
      response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    }
  });
  let stopping;
  const stop = () => {
    process.exitCode ??= 0;
    stopping ??= server.stop();
    stopping.catch((error) => {
      reportFailure(error);
      process.exit(1);
    });
  };
  const closed = server.closed();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    await closed;
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await (stopping ?? server.stop());
  }
}

main().catch(reportFailure);
