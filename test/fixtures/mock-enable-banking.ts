import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

/**
 * Failure mode simulated by the mock.
 */
export type MockMode = "ok" | "rate-limited" | "expired-session" | "upstream-error";

/**
 * One request observed by the mock.
 */
export interface MockCall {
  method: string;
  path: string;
  query: URLSearchParams;
  authorization: string | undefined;
  body: unknown;
}

/**
 * Running mock Enable Banking server.
 */
export interface MockEnableBanking {
  url: string;
  calls: MockCall[];
  setMode: (mode: MockMode) => void;
  close: () => Promise<void>;
}

const ACCOUNT_UID = "acc-1";
const SESSION_ID = "sess-1";

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

/**
 * Builds a transaction payload.
 *
 * @param id - Transaction id.
 * @param date - Booking date in YYYY-MM-DD form.
 * @param amount - Decimal amount.
 * @param direction - Credit or debit indicator.
 * @returns The transaction object returned by the mock.
 */
function transaction(
  id: string,
  date: string,
  amount: string,
  direction: "CRDT" | "DBIT",
): Record<string, unknown> {
  return {
    transaction_id: id,
    booking_date: date,
    transaction_amount: { amount, currency: "EUR" },
    credit_debit_indicator: direction,
    status: "BOOK",
    remittance_information: [`tx ${id}`],
  };
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
 * Parses a JSON body, falling back to the raw text.
 *
 * @param raw - Raw request body.
 * @returns The parsed body, the raw text, or undefined when empty.
 */
function parseBody(raw: string): unknown {
  if (raw === "") return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
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
 * Starts an in-process Enable Banking mock on an ephemeral port.
 *
 * @returns A handle exposing the base URL, recorded calls, failure-mode switch, and close function.
 */
export async function startMockEnableBanking(): Promise<MockEnableBanking> {
  let mode: MockMode = "ok";
  const calls: MockCall[] = [];

  const server = createServer(async (request, response) => {
    try {
      const raw = await readBody(request);
      const url = new URL(request.url ?? "/", "http://localhost");
      const body = parseBody(raw);
      calls.push({
        method: request.method ?? "GET",
        path: url.pathname,
        query: url.searchParams,
        authorization: request.headers.authorization,
        body,
      });

      // Simulate authentication failures and outages
      if (request.headers.authorization === undefined) {
        sendJson(response, 401, { code: "AUTHORIZATION_NOT_PROVIDED", message: "no jwt" });
        return;
      }
      if (mode === "rate-limited") {
        sendJson(response, 429, {
          code: "ASPSP_RATE_LIMIT_EXCEEDED",
          message: "Too many requests",
        });
        return;
      }
      if (mode === "expired-session") {
        sendJson(response, 401, { code: "EXPIRED_SESSION", message: "Session is expired" });
        return;
      }
      if (mode === "upstream-error") {
        sendJson(response, 500, { code: "ASPSP_ERROR", message: "Mock failure" });
        return;
      }

      // Bank selection
      if (url.pathname === "/aspsps" && request.method === "GET") {
        sendJson(response, 200, { aspsps: [{ name: "Mock ASPSP", country: "FI" }] });
        return;
      }

      // Authorization start
      if (url.pathname === "/auth" && request.method === "POST") {
        const authBody = body as { state?: string };
        sendJson(response, 200, {
          url: `https://mock-auth.example/?state=${authBody.state ?? ""}`,
          authorization_id: "authorization-1",
        });
        return;
      }

      // Session exchange
      if (url.pathname === "/sessions" && request.method === "POST") {
        const sessionBody = body as { code?: string };
        if (sessionBody.code === "bad-code") {
          sendJson(response, 400, {
            code: "WRONG_AUTHORIZATION_CODE",
            message: "Wrong authorization code",
          });
          return;
        }
        sendJson(response, 200, {
          session_id: SESSION_ID,
          accounts: [
            {
              uid: ACCOUNT_UID,
              name: "Checking",
              currency: "EUR",
              account_id: { iban: "FI001234" },
            },
          ],
          aspsp: { name: "Mock ASPSP", country: "FI" },
          access: { valid_until: "2099-12-31T00:00:00Z" },
        });
        return;
      }

      // Session inspection and revocation
      if (url.pathname === `/sessions/${SESSION_ID}` && request.method === "GET") {
        sendJson(response, 200, {
          session_id: SESSION_ID,
          status: "AUTHORIZED",
          accounts: [ACCOUNT_UID],
          aspsp: { name: "Mock ASPSP", country: "FI" },
        });
        return;
      }
      if (url.pathname === `/sessions/${SESSION_ID}` && request.method === "DELETE") {
        sendJson(response, 200, { message: "OK" });
        return;
      }

      // Transaction pagination
      if (url.pathname === `/accounts/${ACCOUNT_UID}/transactions`) {
        if (url.searchParams.get("continuation_key") === "page-2") {
          sendJson(response, 200, {
            transactions: [transaction("t3", isoDay(-5), "10.00", "CRDT")],
            continuation_key: null,
          });
          return;
        }
        sendJson(response, 200, {
          transactions: [
            transaction("t1", isoDay(0), "5.00", "DBIT"),
            transaction("t2", isoDay(-3), "20.00", "DBIT"),
            { transaction_id: "undated" },
          ],
          continuation_key: "page-2",
        });
        return;
      }

      sendJson(response, 404, { code: "NOT_FOUND", message: "not found" });
    } catch (error) {
      sendJson(response, 500, {
        code: "MOCK_FAILURE",
        message: error instanceof Error ? error.message : "unknown mock error",
      });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Mock Enable Banking server did not bind to a TCP port.");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    calls,
    setMode: (nextMode: MockMode) => {
      mode = nextMode;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
