import type { Transaction } from "@blunter-bills/enable-banking";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Direction of money movement for a transaction.
 */
export type Direction = "credit" | "debit" | "unknown";

/**
 * Flattened transaction shape returned by this service.
 */
export interface NormalizedTransaction {
  id: string | null;
  date: string | null;
  amount: number | null;
  currency: string | null;
  direction: Direction;
  status: string | null;
  counterparty: string | null;
  description: string | null;
  reference: string | null;
  balance_after: number | null;
}

/**
 * Picks the best available date for filtering, in order of preference.
 *
 * @param transaction - Enable Banking transaction.
 * @returns The date in YYYY-MM-DD form, or null when no usable date exists.
 */
export function transactionDate(transaction: Transaction): string | null {
  const date =
    transaction.booking_date ?? transaction.value_date ?? transaction.transaction_date ?? null;
  return date !== null && DATE_PATTERN.test(date) ? date : null;
}

/**
 * Checks whether a transaction falls inside an inclusive date range.
 *
 * @param transaction - Enable Banking transaction.
 * @param from - Inclusive start date in YYYY-MM-DD form.
 * @param to - Inclusive end date in YYYY-MM-DD form.
 * @returns True when the transaction has a date inside the range.
 */
export function isInDateRange(transaction: Transaction, from: string, to: string): boolean {
  const date = transactionDate(transaction);
  return date !== null && date >= from && date <= to;
}

/**
 * Parses a decimal amount string.
 *
 * @param amount - Amount as returned by Enable Banking, if any.
 * @returns The parsed number, or null when absent or invalid.
 */
function parseAmount(amount: string | undefined): number | null {
  if (amount === undefined) return null;

  //else

  const parsed = Number.parseFloat(amount);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Maps the Enable Banking credit/debit indicator to a direction.
 *
 * @param indicator - Raw credit/debit indicator.
 * @returns The normalized direction.
 */
function resolveDirection(indicator: Transaction["credit_debit_indicator"]): Direction {
  if (indicator === "CRDT") return "credit";
  if (indicator === "DBIT") return "debit";
  return "unknown";
}

/**
 * Joins all remittance information entries into a single description.
 *
 * @param transaction - Enable Banking transaction.
 * @returns The joined remittance text, or null when absent.
 */
function remittance(transaction: Transaction): string | null {
  const info = transaction.remittance_information;
  if (Array.isArray(info)) {
    const joined = info.filter((part) => part !== "").join(" ");
    return joined === "" ? null : joined;
  }

  //else

  if (typeof info === "string") {
    return info === "" ? null : info;
  }

  return null;
}

/**
 * Flattens an Enable Banking transaction into the shape exposed by this service.
 * Amounts are signed: debits are negative, credits positive.
 *
 * @param transaction - Enable Banking transaction.
 * @returns The normalized transaction.
 */
export function normalizeTransaction(transaction: Transaction): NormalizedTransaction {
  // Resolve amount and direction
  const direction = resolveDirection(transaction.credit_debit_indicator);
  const rawAmount = parseAmount(transaction.transaction_amount?.amount);
  const amount =
    rawAmount !== null && direction === "debit" && rawAmount > 0 ? -rawAmount : rawAmount;

  // Return the flattened transaction
  return {
    id: transaction.transaction_id ?? transaction.entry_reference ?? null,
    date: transactionDate(transaction),
    amount,
    currency: transaction.transaction_amount?.currency ?? null,
    direction,
    status: transaction.status ?? null,
    counterparty: transaction.creditor?.name ?? transaction.debtor?.name ?? null,
    description:
      remittance(transaction) ??
      transaction.bank_transaction_code?.description ??
      transaction.note ??
      null,
    reference: transaction.reference_number ?? transaction.entry_reference ?? null,
    balance_after: parseAmount(transaction.balance_after_transaction?.amount),
  };
}
