import { HttpError } from "./errors.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_WINDOW_DAYS = 5;
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 365;

/**
 * Checks whether a value is a real calendar date in YYYY-MM-DD form.
 *
 * @param value - Candidate date string.
 * @returns True when the value is a valid date, false otherwise (e.g. 2026-02-31).
 */
export function isIsoDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;

  //else

  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Returns the current UTC date in YYYY-MM-DD form.
 *
 * @param now - Clock value to use; defaults to the current time.
 * @returns The UTC date.
 */
export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Adds a signed number of days to a UTC date string.
 *
 * @param date - Start date in YYYY-MM-DD form.
 * @param days - Number of days to add; negative values move backwards.
 * @returns The resulting date in YYYY-MM-DD form.
 */
export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/**
 * Input accepted by {@link resolveDateRange}.
 */
export interface DateRangeInput {
  from?: string;
  to?: string;
  days?: number;
}

/**
 * Resolved inclusive date window.
 */
export interface DateRange {
  from: string;
  to: string;
}

/**
 * Resolves the requested window. `days` is used when `from` is omitted
 * ("the last N days"). Future end dates are clamped to today, since Enable
 * Banking rejects date_from in the future.
 *
 * @param input - Requested from/to dates and optional day window.
 * @param now - Clock value to use; defaults to the current time.
 * @returns The inclusive date window.
 * @throws {HttpError} When the day count, a date, or the resulting range is invalid.
 */
export function resolveDateRange(input: DateRangeInput, now: Date = new Date()): DateRange {
  const today = todayUtc(now);
  const days = input.days ?? DEFAULT_WINDOW_DAYS;

  // Validate the day window
  if (!Number.isInteger(days) || days < MIN_WINDOW_DAYS || days > MAX_WINDOW_DAYS) {
    throw new HttpError(
      400,
      "invalid_days",
      `days must be an integer between ${MIN_WINDOW_DAYS} and ${MAX_WINDOW_DAYS}.`,
    );
  }

  // Validate the explicit dates
  if (input.from !== undefined && !isIsoDate(input.from)) {
    throw new HttpError(400, "invalid_from", "from must be a valid date in YYYY-MM-DD format.");
  }
  if (input.to !== undefined && !isIsoDate(input.to)) {
    throw new HttpError(400, "invalid_to", "to must be a valid date in YYYY-MM-DD format.");
  }

  //else

  // Compute the inclusive range
  const to = input.to !== undefined && input.to < today ? input.to : today;
  const from = input.from ?? addDays(to, -days);

  // Check the computed range
  if (from > to) {
    throw new HttpError(400, "invalid_range", "from must be on or before to.");
  }

  return { from, to };
}
