/** Transaction status values accepted by the Enable Banking API. */
export type TransactionStatus = "BOOK" | "CNCL" | "HOLD" | "OTHR" | "PDNG" | "RJCT" | "SCHD";

/** Type of bank account holder. */
export type PsuType = "personal" | "business";

/** Bank (ASPSP) identity. */
export interface Aspsp {
  name: string;
  country: string;
}

/** Bank metadata returned by GET /aspsps. */
export interface AspspInfo {
  name: string;
  country: string;
  logo?: string;
  psu_types?: string[];
  auth_methods?: unknown[];
  beta?: boolean;
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

/** Request body for POST /auth. */
export interface StartAuthorizationRequest {
  access: { valid_until: string };
  aspsp: Aspsp;
  redirect_url: string;
  state: string;
  psu_type?: PsuType;
  language?: string;
}

/** Response from POST /auth. */
export interface StartAuthorizationResponse {
  url: string;
  authorization_id: string;
  psu_id_hash?: string;
}

/** Account identification returned by Enable Banking. */
export interface AccountIdentification {
  iban?: string;
  other?: {
    identification?: string;
    scheme_name?: string;
    issuer?: string;
  };
}

/** Account exposed by an authorized session. */
export interface SessionAccount {
  uid: string;
  name?: string;
  currency?: string;
  account_id?: AccountIdentification;
  all_account_ids?: Array<{ identification: string; scheme_name?: string }>;
  cash_account_type?: string;
  product?: string;
}

/** Response from POST /sessions. */
export interface AuthorizeSessionResponse {
  session_id: string;
  accounts: SessionAccount[];
  aspsp: Aspsp;
  access?: { valid_until?: string };
  psu_type?: PsuType;
}

/** Currency and decimal amount. */
export interface Amount {
  currency?: string;
  amount?: string;
}

/** Named party (creditor or debtor). */
export interface Party {
  name?: string;
}

/** Bank transaction classification. */
export interface BankTransactionCode {
  description?: string;
  code?: string;
  sub_code?: string;
}

/** Enable Banking transaction record. */
export interface Transaction {
  entry_reference?: string;
  transaction_id?: string;
  transaction_amount?: Amount;
  credit_debit_indicator?: "CRDT" | "DBIT";
  status?: TransactionStatus;
  booking_date?: string;
  value_date?: string;
  transaction_date?: string;
  creditor?: Party;
  debtor?: Party;
  creditor_account?: AccountIdentification;
  debtor_account?: AccountIdentification;
  remittance_information?: string[] | string;
  reference_number?: string;
  bank_transaction_code?: BankTransactionCode;
  balance_after_transaction?: Amount;
  merchant_category_code?: string;
  note?: string;
}

/** One page of transactions returned by Enable Banking. */
export interface TransactionsPage {
  transactions: Transaction[];
  continuation_key?: string | null;
}

/** Filters accepted by GET /accounts/{id}/transactions. */
export interface TransactionsQuery {
  date_from?: string;
  date_to?: string;
  continuation_key?: string;
  transaction_status?: TransactionStatus;
}

/** Response from GET /sessions/{session_id}. */
export interface GetSessionResponse {
  session_id: string;
  status: string;
  accounts: string[];
  aspsp: Aspsp;
  access?: { valid_until?: string };
  authorized?: string;
  created?: string;
  psu_type?: PsuType;
}
