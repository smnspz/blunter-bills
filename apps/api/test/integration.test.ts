import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import { startMockEnableBanking } from "./fixtures/mock-enable-banking.js";

// Prepare an isolated data directory and a throwaway RS256 key
const dataDir = await mkdtemp(join(tmpdir(), "enable-banking-service-"));
const mock = await startMockEnableBanking();
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

// Configure the service before importing modules that read config
process.env.ENV_FILE = join(dataDir, "missing.env");
process.env.DATA_DIR = dataDir;
process.env.LOG_LEVEL = "silent";
process.env.SERVICE_API_KEY = "test-secret";
process.env.ENABLE_BANKING_APP_ID = "test-app";
process.env.ENABLE_BANKING_PRIVATE_KEY = privateKey
  .export({ type: "pkcs8", format: "pem" })
  .toString();
process.env.ENABLE_BANKING_BASE_URL = mock.url;
process.env.ENABLE_BANKING_REDIRECT_URL = "http://localhost/auth/callback";
process.env.ENABLE_BANKING_ASPSP_NAME = "Mock ASPSP";
process.env.ENABLE_BANKING_ASPSP_COUNTRY = "FI";
process.env.FRONTEND_URL = "http://localhost:5173";

const { buildApp } = await import("../src/app.js");
const app = buildApp();

after(async () => {
  await app.close();
  await mock.close();
  await rm(dataDir, { recursive: true, force: true });
});

const API_HEADERS = { authorization: "Bearer test-secret" };

interface InjectOptions {
  method: "GET" | "POST" | "DELETE";
  url: string;
  body?: Record<string, unknown>;
  authenticated?: boolean;
}

/**
 * Calls the Fastify app in-process.
 *
 * @param options - Method, URL, optional body, and whether to send the service key.
 * @returns The injected response.
 */
async function call(options: InjectOptions) {
  const headers: Record<string, string> = options.authenticated === false ? {} : { ...API_HEADERS };

  return app.inject({
    method: options.method,
    url: options.url,
    headers,
    ...(options.body !== undefined ? { payload: options.body } : {}),
  });
}

/**
 * Returns the UTC date a number of days from today.
 *
 * @param offset - Day offset; negative values move into the past.
 * @returns The date in YYYY-MM-DD form.
 */
function isoDay(offset: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

describe("Enable Banking service integration", () => {
  let pendingState = "";

  it("serves health without the service key", async () => {
    const response = await call({ method: "GET", url: "/health", authenticated: false });
    assert.equal(response.statusCode, 200);
    const body = response.json<{
      status: string;
      enable_banking_configured: boolean;
      session_active: boolean;
    }>();
    assert.equal(body.status, "ok");
    assert.equal(body.enable_banking_configured, true);
    assert.equal(body.session_active, false);
  });

  it("rejects protected routes without the service key", async () => {
    const response = await call({
      method: "POST",
      url: "/auth",
      body: {},
      authenticated: false,
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.json<{ error: string }>().error, "unauthorized");
  });

  it("rejects a return_url outside the frontend origin", async () => {
    const response = await call({
      method: "POST",
      url: "/auth",
      body: { return_url: "https://evil.example/callback" },
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json<{ error: string }>().error, "invalid_return_url");
  });

  it("returns 404 when no session exists", async () => {
    const response = await call({ method: "GET", url: "/transactions" });
    assert.equal(response.statusCode, 404);
    assert.equal(response.json<{ error: string }>().error, "no_session");
  });

  it("lists banks and upper-cases the country filter", async () => {
    const response = await call({ method: "GET", url: "/aspsps?country=fi" });
    assert.equal(response.statusCode, 200);
    assert.equal(
      response.json<{ aspsps: Array<{ name: string }> }>().aspsps[0]?.name,
      "Mock ASPSP",
    );

    const upstream = mock.calls.filter((entry) => entry.path === "/aspsps").at(-1);
    assert.equal(upstream?.query.get("country"), "FI");
  });

  it("starts authorization and forwards a signed JWT", async () => {
    const response = await call({ method: "POST", url: "/auth", body: { psu_type: "personal" } });
    assert.equal(response.statusCode, 200);

    const body = response.json<{ url: string; state: string; authorization_id: string }>();
    assert.match(body.url, /\?state=/);
    assert.equal(body.authorization_id, "authorization-1");

    const upstream = mock.calls.filter((entry) => entry.path === "/auth").at(-1);
    assert.match(upstream?.authorization ?? "", /^Bearer /);

    pendingState = body.state;
  });

  it("allows the browser callback without the service key", async () => {
    const response = await call({
      method: "GET",
      url: "/auth/callback?error=access_denied&error_description=Denied+by+user",
      authenticated: false,
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json<{ error: string }>().error, "authorization_failed");
  });

  it("rejects an unknown state", async () => {
    const response = await call({
      method: "GET",
      url: "/auth/callback?code=good-code&state=unknown",
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json<{ error: string }>().error, "invalid_state");
  });

  it("surfaces upstream authorization failures", async () => {
    const response = await call({
      method: "GET",
      url: `/auth/callback?code=bad-code&state=${pendingState}`,
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json<{ error: string }>().error, "WRONG_AUTHORIZATION_CODE");
  });

  it("completes authorization and stores the session", async () => {
    const start = await call({ method: "POST", url: "/auth", body: {} });
    const { state } = start.json<{ state: string }>();

    const callback = await call({
      method: "GET",
      url: `/auth/callback?code=good-code&state=${state}`,
    });
    assert.equal(callback.statusCode, 200);

    const body = callback.json<{ session_id: string; accounts: Array<{ uid: string }> }>();
    assert.equal(body.session_id, "sess-1");
    assert.equal(body.accounts[0]?.uid, "acc-1");
  });

  it("lists the authorized accounts", async () => {
    const response = await call({ method: "GET", url: "/accounts" });
    assert.equal(response.statusCode, 200);
    const body = response.json<{ accounts: Array<{ uid: string; iban: string }> }>();
    assert.equal(body.accounts[0]?.uid, "acc-1");
    assert.equal(body.accounts[0]?.iban, "FI001234");
  });

  it("lists the last 5 days, following pagination and filtering locally", async () => {
    const response = await call({ method: "GET", url: "/transactions" });
    assert.equal(response.statusCode, 200);

    const body = response.json<{
      count: number;
      truncated: boolean;
      transactions: Array<{ id: string; amount: number; direction: string; date: string }>;
    }>();
    assert.equal(body.truncated, false);
    assert.equal(body.count, 3);
    assert.deepEqual(
      body.transactions.map((entry) => entry.id),
      ["t1", "t2", "t3"],
    );
    assert.equal(body.transactions[0]?.amount, -5);
    assert.equal(body.transactions[2]?.amount, 10);
    assert.equal(body.transactions[2]?.direction, "credit");
    assert.equal(body.transactions[0]?.date, isoDay(0));

    const upstreamCalls = mock.calls.filter(
      (entry) => entry.path === "/accounts/acc-1/transactions",
    );
    assert.equal(upstreamCalls[0]?.query.get("date_from"), isoDay(-5));
    assert.equal(upstreamCalls[0]?.query.get("date_to"), isoDay(0));
    assert.ok(upstreamCalls.some((entry) => entry.query.get("continuation_key") === "page-2"));
  });

  it("honours an explicit from/to range", async () => {
    const response = await call({
      method: "GET",
      url: `/transactions?from=${isoDay(-3)}&to=${isoDay(0)}`,
    });
    assert.equal(response.statusCode, 200);

    const body = response.json<{ count: number; transactions: Array<{ id: string }> }>();
    assert.equal(body.count, 2);
    assert.deepEqual(
      body.transactions.map((entry) => entry.id),
      ["t1", "t2"],
    );
  });

  it("returns raw transactions when requested", async () => {
    const response = await call({ method: "GET", url: "/transactions?days=2&raw=true" });
    assert.equal(response.statusCode, 200);

    const body = response.json<{
      count: number;
      transactions: Array<{ transaction_id: string; transaction_amount: { amount: string } }>;
    }>();
    assert.equal(body.count, 1);
    assert.equal(body.transactions[0]?.transaction_id, "t1");
    assert.equal(body.transactions[0]?.transaction_amount.amount, "5.00");
  });

  it("rejects an inverted date range", async () => {
    const response = await call({
      method: "GET",
      url: `/transactions?from=${isoDay(0)}&to=${isoDay(-3)}`,
    });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json<{ error: string }>().error, "invalid_range");
  });

  it("rejects an account that is not part of the session", async () => {
    const response = await call({ method: "GET", url: "/transactions?account_id=missing" });
    assert.equal(response.statusCode, 400);
    assert.equal(response.json<{ error: string }>().error, "unknown_account");
  });

  it("passes rate-limit errors through", async () => {
    mock.setMode("rate-limited");
    const response = await call({ method: "GET", url: "/transactions" });
    assert.equal(response.statusCode, 429);
    assert.equal(response.json<{ error: string }>().error, "ASPSP_RATE_LIMIT_EXCEEDED");
  });

  it("maps expired sessions to a bad-gateway error", async () => {
    mock.setMode("expired-session");
    const response = await call({ method: "GET", url: "/transactions" });
    assert.equal(response.statusCode, 502);
    assert.equal(response.json<{ error: string }>().error, "EXPIRED_SESSION");
  });

  it("maps upstream outages to a bad-gateway error", async () => {
    mock.setMode("upstream-error");
    const response = await call({ method: "GET", url: "/transactions" });
    assert.equal(response.statusCode, 502);
    assert.equal(response.json<{ error: string }>().error, "ASPSP_ERROR");
  });

  it("deletes the session and clears local state", async () => {
    mock.setMode("ok");

    const deletion = await call({ method: "DELETE", url: "/session" });
    assert.equal(deletion.statusCode, 200);

    const afterDeletion = await call({ method: "GET", url: "/transactions" });
    assert.equal(afterDeletion.statusCode, 404);
    assert.equal(afterDeletion.json<{ error: string }>().error, "no_session");
  });

  it("redirects denied authorizations back to the frontend", async () => {
    const start = await call({
      method: "POST",
      url: "/auth",
      body: { return_url: "http://localhost:5173/auth/callback" },
    });
    const { state } = start.json<{ state: string }>();

    const callback = await call({
      method: "GET",
      url: `/auth/callback?error=access_denied&error_description=Denied&state=${state}`,
      authenticated: false,
    });

    assert.equal(callback.statusCode, 302);
    assert.equal(
      callback.headers.location,
      "http://localhost:5173/auth/callback?auth=error&message=Denied",
    );
  });

  it("redirects successful authorizations back to the frontend", async () => {
    const start = await call({
      method: "POST",
      url: "/auth",
      body: { return_url: "http://localhost:5173/auth/callback" },
    });
    const { state } = start.json<{ state: string }>();

    const callback = await call({
      method: "GET",
      url: `/auth/callback?code=good-code&state=${state}`,
      authenticated: false,
    });

    assert.equal(callback.statusCode, 302);
    assert.equal(callback.headers.location, "http://localhost:5173/auth/callback?auth=success");
  });
});
