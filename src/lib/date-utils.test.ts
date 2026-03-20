import { describe, it, expect } from "vitest";
import {
  normalizeTransactionDate,
  getMonthBoundaries,
  getYearBoundaries,
  getStartOfMonth,
  getLocalMonth,
  getLocalYear,
  parseDateBoundary,
} from "./date-utils";

describe("normalizeTransactionDate", () => {
  it("sets time to noon local", () => {
    const date = new Date(2026, 2, 15, 0, 0, 0);
    const result = normalizeTransactionDate(date);
    expect(result.getHours()).toBe(12);
    expect(result.getMinutes()).toBe(0);
    expect(result.getSeconds()).toBe(0);
    expect(result.getDate()).toBe(15);
    expect(result.getMonth()).toBe(2);
    expect(result.getFullYear()).toBe(2026);
  });

  it("normalizes a date already at noon", () => {
    const date = new Date(2026, 2, 15, 12, 0, 0);
    const result = normalizeTransactionDate(date);
    expect(result.getHours()).toBe(12);
    expect(result.getDate()).toBe(15);
  });

  it("normalizes a date at 23:59", () => {
    const date = new Date(2026, 2, 15, 23, 59, 59);
    const result = normalizeTransactionDate(date);
    expect(result.getHours()).toBe(12);
    expect(result.getDate()).toBe(15);
  });
});

describe("getMonthBoundaries", () => {
  it("returns correct boundaries for March 2026", () => {
    const [start, end] = getMonthBoundaries(2026, 3);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(2);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(2);
    expect(end.getDate()).toBe(31);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("handles February (non-leap year)", () => {
    const [start, end] = getMonthBoundaries(2025, 2);
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(28);
  });

  it("handles February (leap year)", () => {
    const [start, end] = getMonthBoundaries(2024, 2);
    expect(start.getDate()).toBe(1);
    expect(end.getDate()).toBe(29);
  });

  it("handles December correctly", () => {
    const [start, end] = getMonthBoundaries(2026, 12);
    expect(start.getMonth()).toBe(11);
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(11);
    expect(end.getDate()).toBe(31);
  });

  it("end boundary includes noon transactions on last day of month", () => {
    // Regression: transactions stored at noon on the last day must fall within boundaries
    const [, end] = getMonthBoundaries(2026, 2);
    const noonOnLastDay = new Date(2026, 1, 28, 12, 0, 0);
    expect(noonOnLastDay.getTime()).toBeLessThanOrEqual(end.getTime());
  });

  it("end boundary includes noon transactions on day 31", () => {
    const [, end] = getMonthBoundaries(2026, 3);
    const noonOn31st = new Date(2026, 2, 31, 12, 0, 0);
    expect(noonOn31st.getTime()).toBeLessThanOrEqual(end.getTime());
  });
});

describe("getYearBoundaries", () => {
  it("returns Jan 1 00:00 to Dec 31 23:59:59.999", () => {
    const [start, end] = getYearBoundaries(2026);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(0);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);

    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(11);
    expect(end.getDate()).toBe(31);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });
});

describe("getStartOfMonth", () => {
  it("returns first day of the month at midnight", () => {
    const date = new Date(2026, 2, 20, 15, 30, 0);
    const result = getStartOfMonth(date);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });
});

describe("getLocalMonth", () => {
  it("extracts month from Date object", () => {
    const date = new Date(2026, 2, 15, 12, 0, 0);
    expect(getLocalMonth(date)).toBe(3);
  });

  it("extracts month from date at midnight", () => {
    const date = new Date(2026, 0, 1, 0, 0, 0);
    expect(getLocalMonth(date)).toBe(1);
  });

  it("extracts month from ISO string", () => {
    const date = new Date(2026, 11, 31, 12, 0, 0);
    expect(getLocalMonth(date)).toBe(12);
  });

  it("handles year boundary dates correctly", () => {
    const date = new Date(2026, 0, 1, 0, 0, 0);
    expect(getLocalMonth(date)).toBe(1);
    expect(getLocalYear(date)).toBe(2026);
  });

  it("parses YYYY-MM-DD string without UTC shift", () => {
    // new Date("2026-01-01") is parsed as UTC midnight, which in BRT is Dec 31 2025.
    // getLocalMonth must still return January.
    expect(getLocalMonth("2026-01-01")).toBe(1);
    expect(getLocalMonth("2026-03-01")).toBe(3);
    expect(getLocalMonth("2025-12-31")).toBe(12);
  });

  it("parses ISO datetime strings correctly", () => {
    // Simulates JSON-serialized dates from server (UTC midnight)
    expect(getLocalMonth("2026-03-01T00:00:00.000Z")).toBe(3);
    expect(getLocalMonth("2026-01-01T00:00:00.000Z")).toBe(1);
  });
});

describe("getLocalYear", () => {
  it("extracts year from Date object", () => {
    const date = new Date(2026, 2, 15, 12, 0, 0);
    expect(getLocalYear(date)).toBe(2026);
  });

  it("extracts year from date at midnight", () => {
    const date = new Date(2026, 0, 1, 0, 0, 0);
    expect(getLocalYear(date)).toBe(2026);
  });

  it("parses YYYY-MM-DD string without UTC shift", () => {
    expect(getLocalYear("2026-01-01")).toBe(2026);
    expect(getLocalYear("2025-12-31")).toBe(2025);
  });

  it("parses ISO datetime strings correctly", () => {
    expect(getLocalYear("2026-01-01T00:00:00.000Z")).toBe(2026);
  });
});

describe("parseDateBoundary", () => {
  it("parses YYYY-MM-DD to midnight local", () => {
    const result = parseDateBoundary("2026-03-01");
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it("throws on invalid date string", () => {
    expect(() => parseDateBoundary("invalid")).toThrow("Invalid date string");
  });

  it("throws on partial date string", () => {
    expect(() => parseDateBoundary("2026-03")).toThrow("Invalid date string");
  });
});
