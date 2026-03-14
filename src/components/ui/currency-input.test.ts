import { describe, it, expect } from "vitest";
import { formatDisplay, digitsToRaw } from "./currency-input";

describe("formatDisplay", () => {
  it("returns empty string for empty input", () => {
    expect(formatDisplay("")).toBe("");
  });

  it("returns empty string for non-numeric input", () => {
    expect(formatDisplay("abc")).toBe("");
  });

  it("formats simple values", () => {
    expect(formatDisplay("1")).toBe("1,00");
    expect(formatDisplay("10")).toBe("10,00");
    expect(formatDisplay("100")).toBe("100,00");
  });

  it("formats values with cents", () => {
    expect(formatDisplay("1.50")).toBe("1,50");
    expect(formatDisplay("99.99")).toBe("99,99");
    expect(formatDisplay("0.01")).toBe("0,01");
  });

  it("formats large values with thousands separator", () => {
    expect(formatDisplay("1000")).toBe("1.000,00");
    expect(formatDisplay("1234.56")).toBe("1.234,56");
    expect(formatDisplay("999999.99")).toBe("999.999,99");
    expect(formatDisplay("1000000")).toBe("1.000.000,00");
  });
});

describe("digitsToRaw", () => {
  it("returns empty string for empty input", () => {
    expect(digitsToRaw("")).toBe("");
  });

  it("returns empty string for zero", () => {
    expect(digitsToRaw("0")).toBe("");
    expect(digitsToRaw("00")).toBe("");
    expect(digitsToRaw("000")).toBe("");
  });

  it("converts single digit to cents", () => {
    expect(digitsToRaw("1")).toBe("0.01");
    expect(digitsToRaw("5")).toBe("0.05");
    expect(digitsToRaw("9")).toBe("0.09");
  });

  it("converts two digits to cents", () => {
    expect(digitsToRaw("10")).toBe("0.10");
    expect(digitsToRaw("50")).toBe("0.50");
    expect(digitsToRaw("99")).toBe("0.99");
  });

  it("converts three digits to reais and cents", () => {
    expect(digitsToRaw("100")).toBe("1.00");
    expect(digitsToRaw("150")).toBe("1.50");
    expect(digitsToRaw("999")).toBe("9.99");
  });

  it("converts larger values correctly", () => {
    expect(digitsToRaw("10000")).toBe("100.00");
    expect(digitsToRaw("123456")).toBe("1234.56");
    expect(digitsToRaw("99999999")).toBe("999999.99");
  });
});
