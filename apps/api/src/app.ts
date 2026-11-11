import { timingSafeEqual } from "node:crypto";
import {
  EnableBankingConfigurationError,
  EnableBankingError,
  type EnableBankingClient,
} from "@blunter-bills/enable-banking";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { config, missingEnableBankingConfig } from "./config.js";
import { getConfiguredEnableBanking } from "./enable-banking.js";
import { HttpError } from "./lib/errors.js";
import { AUTH_CALLBACK_PATH, HEALTH_PATH, MAIL_CALLBACK_PATH } from "./lib/paths.js";
import { getConfiguredMailOAuth, type MailOAuth } from "./mail-oauth.js";
import { accountRoutes } from "./routes/accounts.js";
import { authRoutes } from "./routes/auth.js";
import { mailRoutes } from "./routes/mail.js";
import { transactionRoutes } from "./routes/transactions.js";
import { getStoredSession } from "./session-store.js";

const MAX_BODY_BYTES = 1024 * 1024;
const PUBLIC_PATHS = new Set<string>([HEALTH_PATH, AUTH_CALLBACK_PATH, MAIL_CALLBACK_PATH]);

/** Dependencies that can be injected into the app, primarily for tests. */
export interface AppDependencies {
  /** Enable Banking client to use instead of the configured one. */
  enableBanking?: EnableBankingClient;
  /** Gmail OAuth service to use instead of the configured one. */
  mailOAuth?: MailOAuth;
}

/**
 * Compares two strings without leaking their contents through timing.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns True when the values are byte-for-byte equal.
 */
function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

/**
 * Registers optional bearer-token protection for every non-public route.
 *
 * @param app - Fastify instance to attach the hook to.
 * @returns Nothing. Registers the hook.
 */
function registerApiKeyHook(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    const apiKey = config.server.apiKey;
    if (apiKey === undefined) return;

    //else

    // The browser cannot send the service key, so public paths stay open.
    const path = request.url.split("?")[0] ?? "";
    if (PUBLIC_PATHS.has(path)) return;

    //else

    const provided = request.headers.authorization ?? "";
    if (safeEqual(provided, `Bearer ${apiKey}`) === false) {
      return reply.code(401).send({
        error: "unauthorized",
        message: "Missing or invalid bearer token.",
      });
    }
  });
}

/**
 * Registers the application error mapper.
 *
 * @param app - Fastify instance to attach the handler to.
 * @returns Nothing. Registers the handler.
 */
function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Map known application errors
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send({ error: error.code, message: error.message });
    }
    if (error instanceof EnableBankingConfigurationError) {
      return reply.code(500).send({
        error: "invalid_enable_banking_config",
        message: error.message,
      });
    }
    if (error instanceof EnableBankingError) {
      // Upstream auth failures are our configuration problem, not the caller's.
      const passthrough =
        error.status === 429 ||
        (error.status >= 400 && error.status < 500 && error.status !== 401 && error.status !== 403);
      return reply.code(passthrough ? error.status : 502).send({
        error: error.code ?? "enable_banking_error",
        message: error.message,
      });
    }

    // Map request validation errors
    if (error.validation !== undefined) {
      return reply.code(400).send({ error: "validation_error", message: error.message });
    }
    if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({
        error: error.code ?? "bad_request",
        message: error.message,
      });
    }

    // Log and hide unexpected failures
    request.log.error({ err: error }, "unhandled error");
    return reply.code(500).send({
      error: "internal_error",
      message: "Internal server error.",
    });
  });
}

/**
 * Builds the Fastify application with routes, auth, and error mapping.
 *
 * @param dependencies - Optional injected dependencies, primarily for tests.
 * @returns The configured Fastify instance, not yet listening.
 */
export function buildApp(dependencies: AppDependencies = {}): FastifyInstance {
  const app = Fastify({
    logger: { level: config.server.logLevel },
    bodyLimit: MAX_BODY_BYTES,
  });

  const injected = dependencies.enableBanking;
  const getEnableBanking = injected !== undefined ? () => injected : getConfiguredEnableBanking;
  const injectedMail = dependencies.mailOAuth;
  const getMailOAuth = injectedMail !== undefined ? () => injectedMail : getConfiguredMailOAuth;

  registerApiKeyHook(app);
  registerErrorHandler(app);

  /** Reports liveness, configuration state, and whether a session is stored. */
  app.get(HEALTH_PATH, async () => {
    const session = await getStoredSession();
    return {
      status: "ok",
      uptime_seconds: Math.round(process.uptime()),
      enable_banking_configured: missingEnableBankingConfig().length === 0,
      session_active: session !== null,
    };
  });

  app.register(authRoutes, { getEnableBanking });
  app.register(accountRoutes);
  app.register(transactionRoutes, { getEnableBanking });
  app.register(mailRoutes, { getMailOAuth });

  return app;
}
