import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

/** Failure mode simulated by the mock. */
export type MockGoogleMode = "ok" | "auth-error" | "api-error" | "empty";

/** One request observed by the mock. */
export interface MockGoogleCall {
  method: string;
  path: string;
  query: URLSearchParams;
  authorization: string | undefined;
  body: string;
}

/** Running mock Google server. */
export interface MockGoogle {
  url: string;
  calls: MockGoogleCall[];
  setMode: (mode: MockGoogleMode) => void;
  close: () => Promise<void>;
}

const ACCESS_TOKEN = "access-token";
const REFRESH_TOKEN = "refresh-token";
const RECEIVED_AT = 1_760_000_000_000;
const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/**
 * Encodes a string as base64url.
 *
 * @param value - Input string.
 * @returns Base64url text.
 */
function base64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

/**
 * Buffers the request body as a string.
 *
 * @param request - Incoming HTTP request.
 * @returns The raw body.
 */
async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Writes a JSON response.
 *
 * @param response - Outgoing HTTP response.
 * @param status - HTTP status code.
 * @param payload - Value to serialize.
 * @returns Nothing. Ends the response.
 */
function sendJson(response: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  response.end(body);
}

/**
 * Builds the first mock Gmail message.
 *
 * @returns A multipart message with plain and HTML parts.
 */
function messageOne(): Record<string, unknown> {
  return {
    id: "msg-1",
    threadId: "thread-1",
    snippet: "Hello from Alice",
    internalDate: String(RECEIVED_AT),
    payload: {
      mimeType: "multipart/alternative",
      headers: [
        { name: "Subject", value: "=?UTF-8?B?SGVsbG8gZnJvbSBBbGljZQ==?=" },
        { name: "From", value: "Alice <alice@example.com>" },
        { name: "To", value: "me@example.com, Bob <bob@example.com>" },
      ],
      parts: [
        {
          mimeType: "text/plain",
          body: { data: base64Url("Plain body") },
        },
        {
          mimeType: "text/html",
          body: { data: base64Url("<p>HTML body</p>") },
        },
      ],
    },
  };
}

/**
 * Builds the second mock Gmail message.
 *
 * @returns An HTML-only message.
 */
function messageTwo(): Record<string, unknown> {
  return {
    id: "msg-2",
    threadId: "thread-2",
    snippet: "HTML only",
    internalDate: String(RECEIVED_AT),
    payload: {
      mimeType: "text/html",
      headers: [
        { name: "Subject", value: "HTML only" },
        { name: "From", value: "Bob <bob@example.com>" },
        { name: "To", value: "me@example.com" },
      ],
      body: { data: base64Url("<p>Hello <b>world</b></p>") },
    },
  };
}

/**
 * Starts an in-process mock of Google OAuth and the Gmail API.
 *
 * @returns A handle exposing the base URL, recorded calls, failure mode, and close function.
 */
export async function startMockGoogle(): Promise<MockGoogle> {
  let mode: MockGoogleMode = "ok";
  const calls: MockGoogleCall[] = [];

  const server = createServer(async (request, response) => {
    try {
      const raw = await readBody(request);
      const url = new URL(request.url ?? "/", "http://localhost");
      calls.push({
        method: request.method ?? "GET",
        path: url.pathname,
        query: url.searchParams,
        authorization: request.headers.authorization,
        body: raw,
      });

      // OAuth token endpoint
      if (url.pathname === "/token" && request.method === "POST") {
        const params = new URLSearchParams(raw);

        if (params.get("refresh_token") === "bad-refresh" || params.get("code") === "bad-code") {
          sendJson(response, 400, {
            error: "invalid_grant",
            error_description: "Bad credentials",
          });
          return;
        }

        sendJson(response, 200, {
          access_token: ACCESS_TOKEN,
          expires_in: 3600,
          ...(params.get("grant_type") === "authorization_code"
            ? { refresh_token: REFRESH_TOKEN }
            : {}),
          scope: SCOPE,
          token_type: "Bearer",
        });
        return;
      }

      if (request.headers.authorization === undefined) {
        sendJson(response, 401, { error: { code: 401, message: "Missing Authorization" } });
        return;
      }

      // Gmail message list
      if (url.pathname === "/gmail/v1/users/me/messages" && request.method === "GET") {
        if (mode === "auth-error") {
          sendJson(response, 401, { error: { code: 401, message: "Invalid Credentials" } });
          return;
        }
        if (mode === "api-error") {
          sendJson(response, 500, { error: { code: 500, message: "Backend Error" } });
          return;
        }
        if (mode === "empty") {
          sendJson(response, 200, {});
          return;
        }
        sendJson(response, 200, {
          messages: [
            { id: "msg-1", threadId: "thread-1" },
            { id: "msg-2", threadId: "thread-2" },
          ],
        });
        return;
      }

      // Gmail message details
      if (url.pathname === "/gmail/v1/users/me/messages/msg-1" && request.method === "GET") {
        sendJson(response, 200, messageOne());
        return;
      }
      if (url.pathname === "/gmail/v1/users/me/messages/msg-2" && request.method === "GET") {
        sendJson(response, 200, messageTwo());
        return;
      }

      sendJson(response, 404, { error: { code: 404, message: "Not Found" } });
    } catch (error) {
      sendJson(response, 500, {
        error: { code: 500, message: error instanceof Error ? error.message : "mock failure" },
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Mock Google server did not bind to a TCP port.");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    setMode: (nextMode: MockGoogleMode) => {
      mode = nextMode;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
