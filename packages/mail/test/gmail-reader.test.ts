import assert from "node:assert/strict";
import { after, afterEach, before, describe, it } from "node:test";
import { createGmailReader, MailError, type AccessTokenProvider } from "../src/index.js";
import { startMockGoogle, type MockGoogle } from "./fixtures/mock-google.js";

const tokenProvider: AccessTokenProvider = {
  getAccessToken: async () => "test-token",
};

let mock: MockGoogle;
let reader: ReturnType<typeof createGmailReader>;

before(async () => {
  mock = await startMockGoogle();
  reader = createGmailReader({
    accessTokenProvider: tokenProvider,
    baseUrl: mock.url,
  });
});

afterEach(() => {
  mock.setMode("ok");
});

after(async () => {
  await mock.close();
});

describe("GmailReader", () => {
  it("reads subject, body, and metadata", async () => {
    const messages = await reader.readMessages({ maxResults: 2, query: "is:unread" });

    assert.equal(messages.length, 2);
    assert.equal(messages[0]?.provider, "gmail");
    assert.equal(messages[0]?.subject, "Hello from Alice");
    assert.equal(messages[0]?.body, "Plain body");
    assert.equal(messages[0]?.from, "Alice <alice@example.com>");
    assert.deepEqual(messages[0]?.to, ["me@example.com", "Bob <bob@example.com>"]);
    assert.equal(messages[0]?.receivedAt, new Date(1_760_000_000_000).toISOString());
    assert.equal(messages[0]?.snippet, "Hello from Alice");

    assert.equal(messages[1]?.subject, "HTML only");
    assert.equal(messages[1]?.body, "Hello world");

    const listCall = mock.calls.find(
      (entry) => entry.method === "GET" && entry.path === "/gmail/v1/users/me/messages",
    );
    assert.equal(listCall?.authorization, "Bearer test-token");
    assert.equal(listCall?.query.get("maxResults"), "2");
    assert.equal(listCall?.query.get("q"), "is:unread");
  });

  it("returns an empty list when there are no messages", async () => {
    mock.setMode("empty");
    assert.deepEqual(await reader.readMessages(), []);
  });

  it("maps Gmail auth errors", async () => {
    mock.setMode("auth-error");
    await assert.rejects(
      () => reader.readMessages(),
      (error: unknown) =>
        error instanceof MailError && error.code === "API_ERROR" && error.status === 401,
    );
  });

  it("maps Gmail API errors", async () => {
    mock.setMode("api-error");
    await assert.rejects(
      () => reader.readMessages(),
      (error: unknown) =>
        error instanceof MailError && error.code === "API_ERROR" && error.status === 500,
    );
  });

  it("maps transport failures", async () => {
    const offline = createGmailReader({
      accessTokenProvider: tokenProvider,
      baseUrl: "http://127.0.0.1:1",
    });

    await assert.rejects(
      () => offline.readMessages(),
      (error: unknown) => error instanceof MailError && error.code === "TRANSPORT_ERROR",
    );
  });

  it("clamps maxResults to the Gmail limit", async () => {
    await reader.readMessages({ maxResults: 1000 });
    const listCall = mock.calls
      .filter((entry) => entry.path === "/gmail/v1/users/me/messages")
      .at(-1);
    assert.equal(listCall?.query.get("maxResults"), "100");
  });
});
