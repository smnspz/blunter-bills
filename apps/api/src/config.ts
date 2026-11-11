import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { HttpError } from "./lib/errors.js";

// Load .env (or ENV_FILE); existing environment variables win.
const envFile = process.env.ENV_FILE ?? ".env";
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const DEFAULT_PORT = 3000;
const DEFAULT_ACCESS_VALID_DAYS = 90;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Reads an environment variable, trimming it and treating blanks as unset.
 *
 * @param name - Environment variable name.
 * @returns The trimmed value, or undefined when unset or blank.
 */
function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value === undefined || value === "" ? undefined : value;
}

/**
 * Reads a positive integer environment variable.
 *
 * @param name - Environment variable name.
 * @param fallback - Value used when the variable is unset.
 * @returns The parsed positive integer.
 * @throws {Error} When the value is not a positive integer.
 */
function intEnv(name: string, fallback: number): number {
  const raw = optionalEnv(name);
  if (raw === undefined) return fallback;

  //else

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}"`);
  }

  return parsed;
}

/**
 * Loads the Enable Banking private key from either environment variable.
 *
 * @returns The PEM contents, or an empty string when neither variable is set.
 * @throws {Error} When the configured key file does not exist.
 */
function loadPrivateKeyPem(): string {
  const inline = process.env.ENABLE_BANKING_PRIVATE_KEY?.trim();
  if (inline !== undefined && inline !== "") {
    return inline.replaceAll("\\n", "\n");
  }

  //else

  const path = optionalEnv("ENABLE_BANKING_PRIVATE_KEY_PATH");
  if (path === undefined) return "";

  //else

  const resolved = resolve(path);
  if (!existsSync(resolved)) {
    throw new Error(`ENABLE_BANKING_PRIVATE_KEY_PATH points to a missing file: ${resolved}`);
  }

  return readFileSync(resolved, "utf8");
}

const port = intEnv("PORT", DEFAULT_PORT);

/**
 * Fully resolved service configuration.
 */
export const config = {
  server: {
    port,
    host: optionalEnv("HOST") ?? "0.0.0.0",
    logLevel: optionalEnv("LOG_LEVEL") ?? "info",
    /** Optional bearer token required on every route except public paths. */
    apiKey: optionalEnv("SERVICE_API_KEY"),
    /** Public origin of the web app, used to validate return_url. */
    frontendUrl: optionalEnv("FRONTEND_URL") ?? "http://localhost:5173",
  },
  dataDir: resolve(optionalEnv("DATA_DIR") ?? ".data"),
  enableBanking: {
    appId: optionalEnv("ENABLE_BANKING_APP_ID") ?? "",
    privateKeyPem: loadPrivateKeyPem(),
    baseUrl: optionalEnv("ENABLE_BANKING_BASE_URL") ?? "https://api.enablebanking.com",
    jwtAudience: optionalEnv("ENABLE_BANKING_JWT_AUDIENCE") ?? "api.enablebanking.com",
    redirectUrl:
      optionalEnv("ENABLE_BANKING_REDIRECT_URL") ?? `http://localhost:${port}/auth/callback`,
    defaultAspspName: optionalEnv("ENABLE_BANKING_ASPSP_NAME"),
    defaultAspspCountry: optionalEnv("ENABLE_BANKING_ASPSP_COUNTRY"),
    accessValidDays: intEnv("ENABLE_BANKING_ACCESS_VALID_DAYS", DEFAULT_ACCESS_VALID_DAYS),
    timeoutMs: intEnv("ENABLE_BANKING_TIMEOUT_MS", DEFAULT_TIMEOUT_MS),
  },
} as const;

/**
 * Lists the configuration variables required to call Enable Banking.
 *
 * @returns The names of the missing variables, or an empty array when complete.
 */
export function missingEnableBankingConfig(): string[] {
  const missing: string[] = [];
  if (config.enableBanking.appId === "") missing.push("ENABLE_BANKING_APP_ID");
  if (config.enableBanking.privateKeyPem === "") {
    missing.push("ENABLE_BANKING_PRIVATE_KEY or ENABLE_BANKING_PRIVATE_KEY_PATH");
  }

  return missing;
}

/**
 * Ensures Enable Banking credentials are configured.
 *
 * @returns Nothing. Returns when the configuration is complete.
 * @throws {HttpError} When one or more required variables are missing.
 */
export function assertEnableBankingConfigured(): void {
  const missing = missingEnableBankingConfig();
  if (missing.length > 0) {
    throw new HttpError(
      503,
      "enable_banking_not_configured",
      `Enable Banking is not configured. Missing: ${missing.join(", ")}`,
    );
  }
}
