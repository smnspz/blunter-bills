import {
  EnableBankingError,
  type AuthorizeSessionResponse,
  type EnableBankingClient,
  type GetAspspsQuery,
  type GetAspspsResponse,
  type GetSessionResponse,
  type StartAuthorizationRequest,
  type StartAuthorizationResponse,
  type Transaction,
  type TransactionsPage,
  type TransactionsQuery,
} from "@blunter-bills/enable-banking";

/** Failure mode simulated by the fake client. */
export type FakeMode = "ok" | "rate-limited" | "expired-session" | "upstream-error";

/** One call recorded by the fake client. */
export interface FakeCall {
  method: keyof EnableBankingClient;
  args: unknown[];
}

const SESSION_ID = "sess-1";
const ACCOUNT_UID = "acc-1";

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
 * @returns The transaction object returned by the fake.
 */
function transaction(
  id: string,
  date: string,
  amount: string,
  direction: "CRDT" | "DBIT",
): Transaction {
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
 * In-memory Enable Banking client used by API tests.
 */
export class FakeEnableBankingClient implements EnableBankingClient {
  readonly calls: FakeCall[] = [];
  private mode: FakeMode = "ok";

  /**
   * Changes the simulated failure mode.
   *
   * @param mode - Next mode.
   * @returns Nothing.
   */
  setMode(mode: FakeMode): void {
    this.mode = mode;
  }

  /**
   * Returns recorded calls for a method.
   *
   * @param method - Client method name.
   * @returns Matching calls in order.
   */
  callsFor(method: keyof EnableBankingClient): FakeCall[] {
    return this.calls.filter((call) => call.method === method);
  }

  /**
   * Lists fake banks.
   *
   * @param query - Country and service filters.
   * @returns A fixed bank list.
   */
  async listAspsps(query: GetAspspsQuery): Promise<GetAspspsResponse> {
    this.calls.push({ method: "listAspsps", args: [query] });
    return {
      aspsps: [
        { name: "Mock ASPSP", country: "FI", psu_types: ["personal"] },
        { name: "Second Bank", country: "FI", psu_types: ["personal"] },
      ],
    };
  }

  /**
   * Starts fake authorization.
   *
   * @param input - Authorization request.
   * @returns A fake redirect URL and authorization id.
   */
  async startAuthorization(input: StartAuthorizationRequest): Promise<StartAuthorizationResponse> {
    this.calls.push({ method: "startAuthorization", args: [input] });
    return {
      url: `https://mock-auth.example/?state=${input.state}`,
      authorization_id: "authorization-1",
    };
  }

  /**
   * Exchanges a fake authorization code.
   *
   * @param code - Authorization code.
   * @returns A fake session.
   * @throws {EnableBankingError} When the code is `bad-code`.
   */
  async authorizeSession(code: string): Promise<AuthorizeSessionResponse> {
    this.calls.push({ method: "authorizeSession", args: [code] });
    if (code === "bad-code") {
      throw new EnableBankingError("Wrong authorization code", 400, "WRONG_AUTHORIZATION_CODE");
    }
    return this.session();
  }

  /**
   * Returns fake session metadata.
   *
   * @param sessionId - Session id.
   * @returns A fake session summary.
   */
  async getSession(sessionId: string): Promise<GetSessionResponse> {
    this.calls.push({ method: "getSession", args: [sessionId] });
    return {
      session_id: SESSION_ID,
      status: "AUTHORIZED",
      accounts: [ACCOUNT_UID],
      aspsp: { name: "Mock ASPSP", country: "FI" },
    };
  }

  /**
   * Deletes a fake session.
   *
   * @param sessionId - Session id.
   * @returns A success message.
   */
  async deleteSession(sessionId: string): Promise<{ message: string }> {
    this.calls.push({ method: "deleteSession", args: [sessionId] });
    return { message: "OK" };
  }

  /**
   * Returns fake transaction pages.
   *
   * @param accountId - Account uid.
   * @param query - Date, status, and pagination filters.
   * @returns One fake page.
   * @throws {EnableBankingError} When a failure mode is active.
   */
  async getTransactions(accountId: string, query: TransactionsQuery): Promise<TransactionsPage> {
    this.calls.push({ method: "getTransactions", args: [accountId, query] });

    if (this.mode === "rate-limited") {
      throw new EnableBankingError("Too many requests", 429, "ASPSP_RATE_LIMIT_EXCEEDED");
    }
    if (this.mode === "expired-session") {
      throw new EnableBankingError("Session is expired", 401, "EXPIRED_SESSION");
    }
    if (this.mode === "upstream-error") {
      throw new EnableBankingError("Mock failure", 500, "ASPSP_ERROR");
    }

    if (query.continuation_key === "page-2") {
      return {
        transactions: [transaction("t3", isoDay(-5), "10.00", "CRDT")],
        continuation_key: null,
      };
    }

    return {
      transactions: [
        transaction("t1", isoDay(0), "5.00", "DBIT"),
        transaction("t2", isoDay(-3), "20.00", "DBIT"),
        { transaction_id: "undated" },
      ],
      continuation_key: "page-2",
    };
  }

  /**
   * Builds the fake session response.
   *
   * @returns A session with one account.
   */
  private session(): AuthorizeSessionResponse {
    return {
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
    };
  }
}
