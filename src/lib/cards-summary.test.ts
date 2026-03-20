import { describe, it, expect } from "vitest";
import { calculateStatus, calculateLimitUsedPercent } from "./cards-summary";

describe("cards-summary", () => {
  describe("calculateStatus", () => {
    it("returns healthy when limitUsedPercent is null", () => {
      expect(calculateStatus(null)).toBe("healthy");
    });

    it("returns healthy when under 60%", () => {
      expect(calculateStatus(0)).toBe("healthy");
      expect(calculateStatus(30)).toBe("healthy");
      expect(calculateStatus(59.99)).toBe("healthy");
    });

    it("returns warning when between 60% and 80%", () => {
      expect(calculateStatus(60)).toBe("warning");
      expect(calculateStatus(70)).toBe("warning");
      expect(calculateStatus(79.99)).toBe("warning");
    });

    it("returns critical when 80% or above", () => {
      expect(calculateStatus(80)).toBe("critical");
      expect(calculateStatus(90)).toBe("critical");
      expect(calculateStatus(100)).toBe("critical");
      expect(calculateStatus(150)).toBe("critical");
    });
  });

  describe("calculateLimitUsedPercent", () => {
    it("returns null when creditLimit is null", () => {
      expect(calculateLimitUsedPercent(500, null)).toBeNull();
    });

    it("returns null when creditLimit is 0", () => {
      expect(calculateLimitUsedPercent(500, 0)).toBeNull();
    });

    it("returns null when creditLimit is negative", () => {
      expect(calculateLimitUsedPercent(500, -1000)).toBeNull();
    });

    it("calculates percentage correctly", () => {
      expect(calculateLimitUsedPercent(500, 1000)).toBe(50);
      expect(calculateLimitUsedPercent(800, 1000)).toBe(80);
      expect(calculateLimitUsedPercent(1500, 1000)).toBe(150);
    });

    it("uses absolute value of total", () => {
      expect(calculateLimitUsedPercent(-500, 1000)).toBe(50);
    });

    it("rounds to 2 decimal places", () => {
      expect(calculateLimitUsedPercent(333, 1000)).toBe(33.3);
    });
  });
});
