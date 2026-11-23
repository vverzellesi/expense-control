import { describe, expect, it } from "vitest";
import { addMonthsToDate, toBusinessDate } from "./dates";

describe("toBusinessDate (fuso America/Sao_Paulo)", () => {
  it.each([
    ["2026-03-01", "2026-03-01"],
    // meia-noite UTC = a fonte informa só o dia; não pode virar 28/02 21h
    ["2026-03-01T00:00:00.000Z", "2026-03-01"],
    ["2026-03-01T00:00:00Z", "2026-03-01"],
    ["2026-03-01T00:00:00+00:00", "2026-03-01"],
    // instante real: 02:30Z = 23:30 do dia anterior em São Paulo
    ["2026-03-01T02:30:00.000Z", "2026-02-28"],
    ["2026-03-01T03:00:00.000Z", "2026-03-01"],
    ["2026-03-01T23:59:59.000Z", "2026-03-01"],
    ["2026-03-01T00:00:00-03:00", "2026-03-01"],
    // sem fuso: hora de parede
    ["2026-03-01T00:00:00", "2026-03-01"],
    ["2026-03-01T23:00:00", "2026-03-01"],
    // virada de ano
    ["2027-01-01T01:00:00.000Z", "2026-12-31"],
  ])("%s → %s", (input, expected) => {
    expect(toBusinessDate(input)).toBe(expected);
  });

  it("não depende do fuso do processo", () => {
    const original = process.env.TZ;
    try {
      for (const tz of ["UTC", "Asia/Tokyo", "America/Los_Angeles"]) {
        process.env.TZ = tz;
        expect(toBusinessDate("2026-03-01T02:30:00.000Z")).toBe("2026-02-28");
        expect(toBusinessDate("2026-03-01T00:00:00.000Z")).toBe("2026-03-01");
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it.each(["", "ontem", "2026-02-30", "2026-13-01", "2026-11-20 10:00", "11/20/2026", "2026-11-20T10:00:00 BRT"])("recusa %j", (input) => {
    expect(toBusinessDate(input)).toBeNull();
  });
});

describe("addMonthsToDate", () => {
  it.each([
    ["2026-01-31", 1, "2026-02-28"],
    ["2028-01-31", 1, "2028-02-29"], // bissexto
    ["2028-02-29", 12, "2029-02-28"],
    ["2026-03-31", 1, "2026-04-30"],
    ["2026-03-31", -1, "2026-02-28"],
    ["2026-12-15", 1, "2027-01-15"],
    ["2026-01-15", -1, "2025-12-15"],
    ["2026-01-31", 13, "2027-02-28"],
    ["2026-05-10", 0, "2026-05-10"],
  ])("%s + %i meses = %s", (date, months, expected) => {
    expect(addMonthsToDate(date, months)).toBe(expected);
  });

  it("recusa data ou quantidade inválida", () => {
    expect(() => addMonthsToDate("2026-02-30", 1)).toThrow();
    expect(() => addMonthsToDate("01/02/2026", 1)).toThrow();
    expect(() => addMonthsToDate("2026-01-01", 1.5)).toThrow();
  });
});
