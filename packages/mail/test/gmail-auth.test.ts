import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import {
  createGmailAuthorizationUrl,
  createRefreshTokenProvider,
  exchangeGmailAuthorizationCode,
  GMAIL_READONLY_SCOPE,
  MailError,
} from "../src/index.js";
import { startMockGoogle, type MockGoogle } from "./fixtures/mock-google.js";

let mock: MockGoogle;

before(async () => {
  mock = await startMockGoogle();
});

after(async () => {
  await mock.close();
});

describe("Gmail OAuth", () => {
  it("builds the consent URL", () => {
    const url = new URL(
      createGmailAuthorizationUrl({
        clientId: "client-id",
        redirectUri: "http://localhost:8765/oauth2callback",
        state: "state-1",
      }),
    );

    assert.equal(url.origin, "https://accounts.google.com");
    assert.equal(url.searchParams.get("client_id"), "client-id");
    assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:8765/oauth2callback");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("access_type"), "offline");
    assert.equal(url.searchParams.get("prompt"), "consent");
    assert.equal(url.searchParams.get("scope"), GMAIL_READONLY_SCOPE);
    assert.equal(url.searchParams.get("state"), "state-1");
  });

  it("refreshes and caches access tokens", async () => {
    const provider = createRefreshTokenProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "refresh-token",
      tokenUrl: `${mock.url}/token`,
    });

    const beforeCount = mock.calls.filter((entry) => entry.path === "/token").length;

    assert.equal(await provider.getAccessToken(), "access-token");
    assert.equal(await provider.getAccessToken(), "access-token");
    assert.equal(mock.calls.filter((entry) => entry.path === "/token").length, beforeCount + 1);

    const tokenCall = mock.calls.filter((entry) => entry.path === "/token").at(-1);
    const params = new URLSearchParams(tokenCall?.body ?? "");
    assert.equal(params.get("grant_type"), "refresh_token");
    assert.equal(params.get("refresh_token"), "refresh-token");
    assert.equal(params.get("client_id"), "client-id");
  });

  it("maps invalid refresh tokens", async () => {
    const provider = createRefreshTokenProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      refreshToken: "bad-refresh",
      tokenUrl: `${mock.url}/token`,
    });

    await assert.rejects(
      () => provider.getAccessToken(),
      (error: unknown) =>
        error instanceof MailError && error.code === "AUTH_FAILED" && error.status === 400,
    );
  });

  it("exchanges an authorization code", async () => {
    const tokens = await exchangeGmailAuthorizationCode({
      clientId: "client-id",
      clientSecret: "client-secret",
      code: "good-code",
      redirectUri: "http://localhost:8765/oauth2callback",
      tokenUrl: `${mock.url}/token`,
    });

    assert.equal(tokens.accessToken, "access-token");
    assert.equal(tokens.refreshToken, "refresh-token");
    assert.equal(tokens.expiresIn, 3600);
    assert.equal(tokens.scope, GMAIL_READONLY_SCOPE);
  });

  it("maps invalid authorization codes", async () => {
    await assert.rejects(
      () =>
        exchangeGmailAuthorizationCode({
          clientId: "client-id",
          clientSecret: "client-secret",
          code: "bad-code",
          redirectUri: "http://localhost:8765/oauth2callback",
          tokenUrl: `${mock.url}/token`,
        }),
      (error: unknown) =>
        error instanceof MailError && error.code === "AUTH_FAILED" && error.status === 400,
    );
  });
});
