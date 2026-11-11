import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import type { StartAuthorizationRequest, TransactionsQuery } from "@blunter-bills/enable-banking";
import { FakeEnableBankingClient } from "./fixtures/fake-enable-banking.js";
import { FakeMailOAuth } from "./fixtures/fake-mail-oauth.js";

// Prepare an isolated data directory
const dataDir = await mkdtemp(join(tmpdir(), "enable-banking-service-"));

// Configure the service before importing modules that read config
process.env.ENV_FILE = join(dataDir, "missing.env");
process.env.DATA_DIR = dataDir;
process.env.LOG_LEVEL = "silent";
process.env.SERVICE_API_KEY = "test-secret";
process.env.FRONTEND_URL = "http://localhost:5173";
process.env.ENABLE_BANKING_APP_ID = "test-app";
process.env.ENABLE_BANKING_PRIVATE_KEY = "dummy";
process.env.ENABLE_BANKING_REDIRECT_URL = "http://localhost/auth/callback";
process.env.ENABLE_BANKING_ASPSP_NAME = "Mock ASPSP";
process.env.ENABLE_BANKING_ASPSP_COUNTRY = "FI";
process.env.GOOGLE_CLIENT_ID = "test-client";
process.env.GOOGLE_CLIENT_SECRET = "test-secret";
process.env.GOOGLE_REDIRECT_URI = "http://localhost:3000/mail/gmail/callback";

const { buildApp } = await import("../src/app.js");
const fake = new FakeEnableBankingClient();
const mail = new FakeMailOAuth();
const app = buildApp({ enableBanking: fake, mailOAuth: mail });

after(async () => {
  await app.close();
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

describe("Blunter Bills API", () => {
  let pendingState = "";
  let mailState = "";

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

    const upstream = fake.callsFor("listAspsps").at(-1);
    assert.equal((upstream?.args[0] as { country?: string }).country, "FI");
  });

  it("starts authorization with the selected bank", async () => {
    const response = await call({ method: "POST", url: "/auth", body: { psu_type: "personal" } });
    assert.equal(response.statusCode, 200);

    const body = response.json<{ url: string; state: string; authorization_id: string }>();
    assert.match(body.url, /\?state=/);
    assert.equal(body.authorization_id, "authorization-1");

    const upstream = fake.callsFor("startAuthorization").at(-1);
    const input = upstream?.args[0] as StartAuthorizationRequest;
    assert.equal(input.aspsp.name, "Mock ASPSP");
    assert.equal(input.aspsp.country, "FI");
    assert.equal(input.redirect_url, "http://localhost/auth/callback");
    assert.equal(input.psu_type, "personal");
    assert.equal(input.state, body.state);

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

    const upstreamCalls = fake.callsFor("getTransactions");
    const firstQuery = upstreamCalls[0]?.args[1] as TransactionsQuery;
    assert.equal(firstQuery.date_from, isoDay(-5));
    assert.equal(firstQuery.date_to, isoDay(0));
    assert.ok(
      upstreamCalls.some(
        (entry) => (entry.args[1] as TransactionsQuery).continuation_key === "page-2",
      ),
    );
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
    fake.setMode("rate-limited");
    const response = await call({ method: "GET", url: "/transactions" });
    assert.equal(response.statusCode, 429);
    assert.equal(response.json<{ error: string }>().error, "ASPSP_RATE_LIMIT_EXCEEDED");
  });

  it("maps expired sessions to a bad-gateway error", async () => {
    fake.setMode("expired-session");
    const response = await call({ method: "GET", url: "/transactions" });
    assert.equal(response.statusCode, 502);
    assert.equal(response.json<{ error: string }>().error, "EXPIRED_SESSION");
  });

  it("maps upstream outages to a bad-gateway error", async () => {
    fake.setMode("upstream-error");
    const response = await call({ method: "GET", url: "/transactions" });
    assert.equal(response.statusCode, 502);
    assert.equal(response.json<{ error: string }>().error, "ASPSP_ERROR");
  });

  it("deletes the session and clears local state", async () => {
    fake.setMode("ok");

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

  it("reports mail as configured but disconnected", async () => {
    const response = await call({ method: "GET", url: "/mail/status" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      configured: true,
      connected: false,
      provider: null,
      connected_at: null,
    });
  });

  it("starts the Gmail consent flow", async () => {
    const response = await call({ method: "POST", url: "/mail/gmail/start" });
    assert.equal(response.statusCode, 200);

    const body = response.json<{ url: string; state: string }>();
    assert.match(body.url, /\?state=/);
    assert.ok(mail.calls.includes(`url:${body.state}`));
    mailState = body.state;
  });

  it("completes the mail callback and stores the connection", async () => {
    const callback = await call({
      method: "GET",
      url: `/mail/gmail/callback?code=good-code&state=${mailState}`,
      authenticated: false,
    });
    assert.equal(callback.statusCode, 302);
    assert.equal(callback.headers.location, "http://localhost:5173/setup/mail?mail=success");

    const status = await call({ method: "GET", url: "/mail/status" });
    const body = status.json<{ connected: boolean; provider: string }>();
    assert.equal(body.connected, true);
    assert.equal(body.provider, "gmail");
  });

  it("disconnects the mail account", async () => {
    const response = await call({ method: "DELETE", url: "/mail" });
    assert.equal(response.statusCode, 200);

    const status = await call({ method: "GET", url: "/mail/status" });
    assert.equal(status.json<{ connected: boolean }>().connected, false);
  });

  it("redirects mail failures to the setup page", async () => {
    const start = await call({ method: "POST", url: "/mail/gmail/start" });
    const { state } = start.json<{ state: string }>();

    const callback = await call({
      method: "GET",
      url: `/mail/gmail/callback?code=bad-code&state=${state}`,
      authenticated: false,
    });
    assert.equal(callback.statusCode, 302);
    assert.equal(
      callback.headers.location,
      "http://localhost:5173/setup/mail?mail=error&message=AUTH_FAILED",
    );

    const status = await call({ method: "GET", url: "/mail/status" });
    assert.equal(status.json<{ connected: boolean }>().connected, false);
  });
});
