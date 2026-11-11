import type { FastifyInstance } from "fastify";
import { buildApp } from "./app.js";
import { config, missingEnableBankingConfig } from "./config.js";

/**
 * Registers graceful shutdown handlers.
 *
 * @param app - Fastify instance to close on SIGINT or SIGTERM.
 * @returns Nothing. Registers process listeners.
 */
function registerShutdownHandlers(app: FastifyInstance): void {
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, async () => {
      app.log.info({ signal }, "shutting down");
      await app.close();
      process.exit(0);
    });
  }
}

/**
 * Starts the HTTP server.
 *
 * @returns Nothing. Resolves once the listener is ready.
 */
async function main(): Promise<void> {
  const app = buildApp();
  registerShutdownHandlers(app);

  try {
    await app.listen({ port: config.server.port, host: config.server.host });

    // Warn when the service started without credentials
    const missing = missingEnableBankingConfig();
    if (missing.length > 0) {
      app.log.warn(
        `Enable Banking credentials are not configured yet (${missing.join(", ")}). ` +
          "/health works, but /auth and /transactions will return 503 until they are set.",
      );
    }
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

await main();
