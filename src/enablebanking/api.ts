import { request } from "./client.js";
import type {
  AuthorizeSessionResponse,
  GetSessionResponse,
  StartAuthorizationRequest,
  StartAuthorizationResponse,
  TransactionStatus,
  TransactionsPage,
} from "./types.js";

/** Bank metadata returned by GET /aspsps. */
export interface AspspInfo {
  name: string;
  country: string;
  logo?: string;
  psu_types?: string[];
  auth_methods?: unknown[];
}

/** Response from GET /aspsps. */
export interface GetAspspsResponse {
  aspsps: AspspInfo[];
}

/** Filters accepted by GET /aspsps. */
export interface GetAspspsQuery {
  country?: string;
  service?: string;
}

/** Filters accepted by GET /accounts/{id}/transactions. */
export interface TransactionsQuery {
  date_from?: string;
  date_to?: string;
  continuation_key?: string;
  transaction_status?: TransactionStatus;
}

/**
 * Lists the banks available to this application.
 *
 * @param query - Optional country and service filters.
 * @returns The matching banks.
 * @throws {EnableBankingError} When the upstream request fails.
 */
export function getAspsps(query: GetAspspsQuery): Promise<GetAspspsResponse> {
  // Map the typed filters onto query-string parameters
  const params: Record<string, string | undefined> = {
    country: query.country,
    service: query.service,
  };

  return request<GetAspspsResponse>("GET", "/aspsps", { query: params });
}

/**
 * Starts bank authorization for the given bank and consent.
 *
 * @param input - Authorization request details.
 * @returns The redirect URL the user must open.
 * @throws {EnableBankingError} When the upstream request fails.
 */
export function startAuthorization(
  input: StartAuthorizationRequest,
): Promise<StartAuthorizationResponse> {
  return request<StartAuthorizationResponse>("POST", "/auth", { body: input });
}

/**
 * Exchanges an authorization code for a session.
 *
 * @param code - Authorization code returned by Enable Banking.
 * @returns The authorized session and its accounts.
 * @throws {EnableBankingError} When the code is rejected.
 */
export function authorizeSession(code: string): Promise<AuthorizeSessionResponse> {
  return request<AuthorizeSessionResponse>("POST", "/sessions", { body: { code } });
}

/**
 * Fetches upstream session metadata.
 *
 * @param sessionId - Previously authorized session id.
 * @returns The session data.
 * @throws {EnableBankingError} When the session does not exist.
 */
export function getSession(sessionId: string): Promise<GetSessionResponse> {
  return request<GetSessionResponse>("GET", `/sessions/${encodeURIComponent(sessionId)}`);
}

/**
 * Deletes (revokes) an upstream session.
 *
 * @param sessionId - Previously authorized session id.
 * @returns A success message from Enable Banking.
 * @throws {EnableBankingError} When the session cannot be deleted.
 */
export function deleteSession(sessionId: string): Promise<{ message: string }> {
  return request<{ message: string }>("DELETE", `/sessions/${encodeURIComponent(sessionId)}`);
}

/**
 * Fetches one page of transactions for an account.
 *
 * @param accountId - Account uid exposed by an authorized session.
 * @param query - Date, pagination, and status filters.
 * @returns One page of transactions.
 * @throws {EnableBankingError} When the upstream request fails.
 */
export function getTransactions(
  accountId: string,
  query: TransactionsQuery,
): Promise<TransactionsPage> {
  // Map the typed filters onto query-string parameters
  const params: Record<string, string | undefined> = {
    date_from: query.date_from,
    date_to: query.date_to,
    continuation_key: query.continuation_key,
    transaction_status: query.transaction_status,
  };

  return request<TransactionsPage>(
    "GET",
    `/accounts/${encodeURIComponent(accountId)}/transactions`,
    { query: params },
  );
}
