/**
 * Centralized date utilities for consistent timezone handling.
 *
 * Key principles:
 * - Transaction dates are stored at noon local time (12:00) to avoid timezone shifts
 * - Query boundaries use midnight (00:00) for start and 23:59:59.999 for end
 * - Month/year extraction normalizes to noon before reading components
 */

/** Normalizes a transaction date to noon local time to avoid timezone shift issues. */
export function normalizeTransactionDate(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
    0,
    0
  );
}

/** Returns [start, end] boundaries for a month, suitable for database queries. */
export function getMonthBoundaries(
  year: number,
  month: number
): [Date, Date] {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return [start, end];
}

/** Returns [start, end] boundaries for a year, suitable for database queries. */
export function getYearBoundaries(year: number): [Date, Date] {
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return [start, end];
}

/** Returns the start of the month (day 1 at midnight) for a given date. */
export function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

/** Extracts month (1-12) from a date in a timezone-safe way by normalizing to noon first. */
export function getLocalMonth(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return (
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0).getMonth() +
    1
  );
}

/** Extracts year from a date in a timezone-safe way by normalizing to noon first. */
export function getLocalYear(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    12,
    0,
    0
  ).getFullYear();
}

/**
 * Parses a YYYY-MM-DD string into a Date at midnight local time.
 * Used for query boundaries (start of range), NOT for storing transaction dates.
 */
export function parseDateBoundary(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}
