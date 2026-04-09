import { describe, it, expect } from "vitest";
import {
  SATS_PER_BTC,
  satsToSbtc,
  sbtcToSats,
  formatSbtc,
  formatSbtcCompact,
  satsToUsd,
  BTC_USD,
} from "@/lib/constants";

describe("satsToSbtc", () => {
  it("converts 100_000_000 sats to 1 sBTC", () => {
    expect(satsToSbtc(SATS_PER_BTC)).toBe(1);
  });

  it("converts 1 sat to 0.00000001 sBTC", () => {
    expect(satsToSbtc(1)).toBeCloseTo(0.00000001, 10);
  });

  it("converts 0 sats to 0", () => {
    expect(satsToSbtc(0)).toBe(0);
  });

  it("converts 50_000 sats correctly", () => {
    expect(satsToSbtc(50_000)).toBeCloseTo(0.0005, 8);
  });
});

describe("sbtcToSats", () => {
  it("converts 1 sBTC to 100_000_000 sats", () => {
    expect(sbtcToSats(1)).toBe(SATS_PER_BTC);
  });

  it("converts 0.001 sBTC to 100_000 sats", () => {
    expect(sbtcToSats(0.001)).toBe(100_000);
  });

  it("rounds to nearest sat", () => {
    // 0.000000015 sBTC — floating-point precision means this rounds to 1
    expect(sbtcToSats(0.000000015)).toBe(1);
    // Whole number conversion is exact
    expect(sbtcToSats(0.00000002)).toBe(2);
  });

  it("handles 0", () => {
    expect(sbtcToSats(0)).toBe(0);
  });

  it("is inverse of satsToSbtc", () => {
    const original = 9000;
    expect(sbtcToSats(satsToSbtc(original))).toBe(original);
  });
});

describe("formatSbtc", () => {
  it("formats 1 BTC worth of sats", () => {
    expect(formatSbtc(100_000_000)).toBe("1.00000000");
  });

  it("formats small amounts with 8 decimals", () => {
    expect(formatSbtc(1)).toBe("0.00000001");
  });

  it("formats 50000 sats", () => {
    expect(formatSbtc(50_000)).toBe("0.00050000");
  });

  it("formats 0 sats", () => {
    expect(formatSbtc(0)).toBe("0.00000000");
  });

  it("formats 9000 sats (typical test payment)", () => {
    expect(formatSbtc(9000)).toBe("0.00009000");
  });
});

describe("formatSbtcCompact", () => {
  it("shows full precision for tiny amounts", () => {
    expect(formatSbtcCompact(1)).toBe("0.00000001");
  });

  it("shows full precision for amounts < 0.001 sBTC", () => {
    expect(formatSbtcCompact(50_000)).toBe("0.00050000");
  });

  it("shows 2 decimals for whole sBTC amounts", () => {
    expect(formatSbtcCompact(100_000_000)).toBe("1.00");
  });

  it("uses K notation for ≥1000 sBTC", () => {
    expect(formatSbtcCompact(100_000_000_000)).toBe("1.0K");
  });
});

describe("satsToUsd", () => {
  it("converts sats to USD using default rate", () => {
    const result = satsToUsd(100_000, BTC_USD);
    expect(parseFloat(result)).toBeGreaterThan(0);
  });

  it("returns '0.00' for 0 sats", () => {
    expect(satsToUsd(0)).toBe("0.00");
  });

  it("accepts custom rate", () => {
    // 1 sat at $100k/BTC = $0.001
    expect(satsToUsd(1, 0.001)).toBe("0.00");
    expect(satsToUsd(1000, 0.001)).toBe("1.00");
  });
});
