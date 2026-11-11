import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { after, afterEach, before, describe, it } from "node:test";
import { decodeJwt, decodeProtectedHeader, importSPKI, jwtVerify } from "jose";
import {
  createEnableBankingClient,
  EnableBankingConfigurationError,
  EnableBankingError,
  type EnableBankingClient,
} from "../src/index.js";
import { startMockEnableBanking, type MockEnableBanking } from "./fixtures/mock-server.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const publicKeyPem = publicKey.export({ type: "spki", format: "pem" }).toString();

let mock: MockEnableBanking;
let client: EnableBankingClient;

before(async () => {
  mock = await startMockEnableBanking();
  client = createEnableBankingClient({
    appId: "test-app",
    privateKeyPem,
    baseUrl: mock.url,
    audience: "api.enablebanking.com",
    timeoutMs: 2000,
  });
});

afterEach(() => {
  mock.setMode("ok");
});

after(async () => {
  await mock.close();
});

describe("JWT", () => {
  it("signs a JWT with the configured app id and audience", async () => {
    await client.listAspsps({ country: "IT" });
    const call = mock.calls.filter((entry) => entry.path === "/aspsps").at(-1);
    const token = (call?.authorization ?? "").replace(/^Bearer /, "");
    assert.notEqual(token, "");

    const header = decodeProtectedHeader(token);
    assert.equal(header.alg, "RS256");
    assert.equal(header.kid, "test-app");

    const payload = decodeJwt(token);
    assert.equal(payload.iss, "enablebanking.com");
    assert.equal(payload.aud, "api.enablebanking.com");

    const key = await importSPKI(publicKeyPem, "RS256");
    await jwtVerify(token, key);
  });
});

describe("endpoints", () => {
  it("lists ASPSPs with the country filter", async () => {
    const result = await client.listAspsps({ country: "IT" });
    assert.equal(result.aspsps[0]?.name, "Mock ASPSP");

    const call = mock.calls.filter((entry) => entry.path === "/aspsps").at(-1);
    assert.equal(call?.query.get("country"), "IT");
  });

  it("starts authorization", async () => {
    const input = {
      access: { valid_until: "2099-01-01T00:00:00.000Z" },
      aspsp: { name: "Mock ASPSP", country: "FI" },
      redirect_url: "http://localhost:3000/auth/callback",
      state: "state-1",
      psu_type: "personal" as const,
    };

    const result = await client.startAuthorization(input);
    assert.equal(result.authorization_id, "authorization-1");

    const call = mock.calls.filter((entry) => entry.path === "/auth").at(-1);
    assert.deepEqual(call?.body, input);
  });

  it("authorizes a session", async () => {
    const result = await client.authorizeSession("good-code");
    assert.equal(result.session_id, "sess-1");

    const call = mock.calls
      .filter((entry) => entry.path === "/sessions" && entry.method === "POST")
      .at(-1);
    assert.deepEqual(call?.body, { code: "good-code" });
  });

  it("fetches a session", async () => {
    const result = await client.getSession("sess-1");
    assert.equal(result.status, "AUTHORIZED");
  });

  it("deletes a session", async () => {
    const result = await client.deleteSession("sess-1");
    assert.equal(result.message, "OK");
    assert.ok(
      mock.calls.some((entry) => entry.method === "DELETE" && entry.path === "/sessions/sess-1"),
    );
  });

  it("fetches one transaction page with filters", async () => {
    const result = await client.getTransactions("acc-1", {
      date_from: "2026-11-06",
      date_to: "2026-11-11",
      transaction_status: "BOOK",
    });
    assert.ok(Array.isArray(result.transactions));

    const call = mock.calls.filter((entry) => entry.path === "/accounts/acc-1/transactions").at(-1);
    assert.equal(call?.query.get("date_from"), "2026-11-06");
    assert.equal(call?.query.get("date_to"), "2026-11-11");
    assert.equal(call?.query.get("transaction_status"), "BOOK");
  });
});

describe("errors", () => {
  it("maps rate limits", async () => {
    mock.setMode("rate-limited");
    await assert.rejects(
      () => client.listAspsps({ country: "IT" }),
      (error: unknown) =>
        error instanceof EnableBankingError &&
        error.status === 429 &&
        error.code === "ASPSP_RATE_LIMIT_EXCEEDED",
    );
  });

  it("maps expired sessions", async () => {
    mock.setMode("expired-session");
    await assert.rejects(
      () => client.getSession("sess-1"),
      (error: unknown) =>
        error instanceof EnableBankingError &&
        error.status === 401 &&
        error.code === "EXPIRED_SESSION",
    );
  });

  it("maps upstream outages", async () => {
    mock.setMode("upstream-error");
    await assert.rejects(
      () => client.listAspsps({ country: "IT" }),
      (error: unknown) =>
        error instanceof EnableBankingError && error.status === 500 && error.code === "ASPSP_ERROR",
    );
  });

  it("maps transport failures", async () => {
    const offline = createEnableBankingClient({
      appId: "offline-app",
      privateKeyPem,
      baseUrl: "http://127.0.0.1:1",
      timeoutMs: 1000,
    });

    await assert.rejects(
      () => offline.listAspsps({ country: "IT" }),
      (error: unknown) =>
        error instanceof EnableBankingError &&
        error.status === 502 &&
        error.code === "UPSTREAM_UNREACHABLE",
    );
  });
});

describe("configuration", () => {
  it("requires an app id", () => {
    assert.throws(
      () => createEnableBankingClient({ appId: " ", privateKeyPem }),
      EnableBankingConfigurationError,
    );
  });

  it("requires a private key", () => {
    assert.throws(
      () => createEnableBankingClient({ appId: "test-app", privateKeyPem: "" }),
      EnableBankingConfigurationError,
    );
  });

  it("rejects an invalid base URL", () => {
    assert.throws(
      () => createEnableBankingClient({ appId: "test-app", privateKeyPem, baseUrl: "not a url" }),
      EnableBankingConfigurationError,
    );
  });

  it("reports an invalid PEM on first use", async () => {
    const invalid = createEnableBankingClient({
      appId: "test-app",
      privateKeyPem: "not-a-pem",
      baseUrl: mock.url,
    });

    await assert.rejects(
      () => invalid.listAspsps({ country: "IT" }),
      EnableBankingConfigurationError,
    );
  });

  it("keeps client state independent", async () => {
    const second = createEnableBankingClient({
      appId: "second-app",
      privateKeyPem,
      baseUrl: mock.url,
    });

    await second.listAspsps({ country: "FI" });
    const call = mock.calls.filter((entry) => entry.path === "/aspsps").at(-1);
    const token = (call?.authorization ?? "").replace(/^Bearer /, "");
    assert.equal(decodeProtectedHeader(token).kid, "second-app");
  });
});
