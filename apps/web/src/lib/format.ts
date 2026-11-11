/**
 * Formats an ISO date-time for display.
 *
 * @param value - ISO date-time, or null.
 * @returns A short localized date, or "n/a" when absent or invalid.
 */
export function formatDate(value: string | null): string {
  if (value === null) return "n/a";

  //else

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(date);
}

/**
 * Formats an account count as a short label.
 *
 * @param count - Number of accounts.
 * @returns Singular or plural label.
 */
export function accountCountLabel(count: number): string {
  return count === 1 ? "1 account" : `${count} accounts`;
}
