import type { FastifyInstance } from "fastify";
import { getTransactions } from "../enablebanking/api.js";
import type { Transaction, TransactionStatus } from "../enablebanking/types.js";
import { resolveDateRange, type DateRange } from "../lib/dates.js";
import { HttpError } from "../lib/errors.js";
import { isInDateRange, normalizeTransaction, transactionDate } from "../lib/transactions.js";
import { getStoredSession, type StoredAccount } from "../session-store.js";

interface TransactionsQuerystring {
  account_id?: string;
  from?: string;
  to?: string;
  days?: number;
  status?: TransactionStatus;
  raw?: boolean;
}

interface FetchResult {
  transactions: Transaction[];
  truncated: boolean;
}

/** Safety valve so a broken continuation_key can never loop forever. */
const MAX_PAGES = 20;

const querystringSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    account_id: { type: "string", minLength: 1 },
    from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    days: { type: "integer", minimum: 1, maximum: 365 },
    status: { type: "string", enum: ["BOOK", "CNCL", "HOLD", "OTHR", "PDNG", "RJCT", "SCHD"] },
    raw: { type: "boolean" },
  },
} as const;

/**
 * Checks whether a continuation key should be followed.
 *
 * @param key - Continuation key returned by Enable Banking.
 * @returns True when the key is a non-empty string.
 */
function hasContinuationKey(key: string | null | undefined): key is string {
  return key !== undefined && key !== null && key !== "";
}

/**
 * Selects the requested account from the authorized session.
 *
 * @param accounts - Accounts exposed by the session.
 * @param accountId - Requested account uid, or undefined to use the first account.
 * @returns The selected account.
 * @throws {HttpError} When the requested account is unknown or the session has no accounts.
 */
function selectAccount(accounts: StoredAccount[], accountId: string | undefined): StoredAccount {
  const account =
    accountId !== undefined
      ? accounts.find((candidate) => candidate.uid === accountId)
      : accounts[0];

  if (account === undefined) {
    if (accountId !== undefined) {
      throw new HttpError(
        400,
        "unknown_account",
        `Account ${accountId} is not part of the authorized session.`,
      );
    }
    throw new HttpError(409, "no_account", "The authorized session does not expose any accounts.");
  }

  return account;
}

/**
 * Fetches every page of transactions for an account.
 *
 * @param accountId - Account uid exposed by the authorized session.
 * @param range - Inclusive date window to request.
 * @param status - Optional transaction status filter.
 * @returns The collected transactions and whether the page cap was reached.
 * @throws {EnableBankingError} When an upstream request fails.
 */
async function fetchAllTransactions(
  accountId: string,
  range: DateRange,
  status: TransactionStatus | undefined,
): Promise<FetchResult> {
  const transactions: Transaction[] = [];
  let continuationKey: string | null | undefined;
  let pages = 0;

  // Page through the upstream response
  do {
    const page = await getTransactions(accountId, {
      date_from: range.from,
      date_to: range.to,
      ...(status !== undefined ? { transaction_status: status } : {}),
      ...(hasContinuationKey(continuationKey) ? { continuation_key: continuationKey } : {}),
    });
    transactions.push(...page.transactions);
    continuationKey = page.continuation_key;
    pages += 1;
  } while (hasContinuationKey(continuationKey) && pages < MAX_PAGES);

  // Report whether more pages remain
  return { transactions, truncated: hasContinuationKey(continuationKey) };
}

/**
 * Sorts transactions newest first by their best available date.
 *
 * @param a - First transaction.
 * @param b - Second transaction.
 * @returns Negative, zero, or positive according to sort order.
 */
function compareByDateDesc(a: Transaction, b: Transaction): number {
  const dateA = transactionDate(a) ?? "";
  const dateB = transactionDate(b) ?? "";
  return dateB.localeCompare(dateA);
}

/**
 * Registers the transaction listing route.
 *
 * @param app - Fastify instance to attach routes to.
 * @returns Nothing. Resolves once routes are registered.
 */
export async function transactionRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Lists transactions for the authorized account, filtered by date.
   *
   * Examples:
   *   GET /transactions                      -> last 5 days (default)
   *   GET /transactions?days=30              -> last 30 days
   *   GET /transactions?from=2026-11-06&to=2026-11-11
   */
  app.get<{ Querystring: TransactionsQuerystring }>(
    "/transactions",
    { schema: { querystring: querystringSchema } },
    async (request) => {
      const query = request.query;

      // Load the authorized session
      const session = await getStoredSession();
      if (session === null) {
        throw new HttpError(404, "no_session", "No authorized session. Call POST /auth first.");
      }

      //else

      // Resolve the account and date range
      const account = selectAccount(session.accounts, query.account_id);
      const range = resolveDateRange({
        from: query.from,
        to: query.to,
        days: query.days,
      });

      // Fetch and page through transactions
      const { transactions, truncated } = await fetchAllTransactions(
        account.uid,
        range,
        query.status,
      );

      // Filter locally and sort newest first
      const filtered = transactions
        .filter((transaction) => isInDateRange(transaction, range.from, range.to))
        .sort(compareByDateDesc);

      // Return raw or normalized transactions
      return {
        account_id: account.uid,
        iban: account.iban,
        from: range.from,
        to: range.to,
        count: filtered.length,
        truncated,
        transactions: query.raw === true ? filtered : filtered.map(normalizeTransaction),
      };
    },
  );
}
