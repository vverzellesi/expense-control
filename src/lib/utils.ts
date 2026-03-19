import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function formatDate(date: Date | string): string {
  let d: Date;
  if (typeof date === "string") {
    // YYYY-MM-DD strings: parse with local timezone to avoid UTC shift
    // Strings with time component (T): use Date constructor directly
    d = date.includes("T") ? new Date(date) : parseDateLocal(date);
  } else {
    d = date;
  }
  return new Intl.DateTimeFormat("pt-BR").format(d);
}

export function parseDate(dateString: string): Date {
  const parts = dateString.split("/");
  if (parts.length === 3) {
    const [day, month, year] = parts;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return new Date(dateString);
}

/**
 * Parses a YYYY-MM-DD string into a Date at noon local time.
 * Avoids timezone issues where new Date("YYYY-MM-DDT12:00:00") is ambiguous.
 * Using the Date constructor with numeric args always creates local time.
 */
export function parseDateLocal(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error(`Invalid date string: ${dateStr}`);
  }
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * Formats a Date as YYYY-MM-DD using local timezone.
 * Replaces toISOString().split("T")[0] which uses UTC and can shift dates.
 */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
