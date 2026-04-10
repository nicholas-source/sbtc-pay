/**
 * Centralized constants for the sBTC Pay platform.
 *
 * BTC_USD_RATE: sats-to-USD conversion factor.
 *   1 sat = 1 / 100_000_000 BTC, so at $97,500/BTC → 1 sat ≈ $0.000975.
 *
 * In components that need a live rate, prefer `useWalletStore().usdRate`
 * (USD per whole BTC). This constant is for display-only estimates.
 */
export const BTC_USD = 0.000975;

export const SATS_PER_BTC = 100_000_000;

/** Mock BTC price in USD used across the platform */
export const BTC_USD_PRICE = 97_500;

/**
 * Convert sats to an approximate USD string.
 */
export function satsToUsd(sats: number, rate = BTC_USD): string {
  return (sats * rate).toFixed(2);
}

// ── sBTC denomination helpers ──────────────────────────────────────

/**
 * Convert sats (integer) to sBTC (decimal).
 * 1 sBTC = 100,000,000 sats (8 decimal places, like Bitcoin).
 */
export function satsToSbtc(sats: number): number {
  return sats / SATS_PER_BTC;
}

/**
 * Convert sBTC (decimal) to sats (integer).
 * Rounds to nearest sat to avoid floating-point issues.
 */
export function sbtcToSats(sbtc: number): number {
  return Math.round(sbtc * SATS_PER_BTC);
}

/**
 * Format a sats amount as an sBTC display string.
 * Smart formatting:
 *   0          → "0"
 *   1          → "1 sat"       (< 1000 sats → show sats for clarity)
 *   999        → "999 sats"
 *   1000       → "0.00001"
 *   50000      → "0.0005"
 *   12500      → "0.000125"
 *   100000000  → "1.00"
 *   250000000  → "2.50"
 */
export function formatSbtc(sats: number): string {
  if (sats === 0) return "0";
  if (sats < 1000) return `${sats} sat${sats === 1 ? "" : "s"}`;
  const sbtc = satsToSbtc(sats);
  if (sbtc >= 1) return sbtc.toFixed(2);
  // For sub-1 amounts, use enough precision then trim trailing zeros
  const decimals = sbtc >= 0.001 ? 4 : sbtc >= 0.000001 ? 6 : 8;
  return sbtc.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Format sats as sBTC with full 8-decimal precision.
 * Use in tooltips, detail views, or when exact value matters.
 */
export function formatSbtcFull(sats: number): string {
  if (sats === 0) return "0.00000000";
  return satsToSbtc(sats).toFixed(8);
}

/**
 * Abbreviate an sBTC amount for compact display (charts, stat cards).
 * Examples:
 *   0           → "0"
 *   50000       → "0.0005"
 *   100000000   → "1.0"
 *   5000000000  → "50.0"
 */
export function formatSbtcCompact(sats: number): string {
  if (sats === 0) return "0";
  const sbtc = satsToSbtc(sats);
  if (sbtc >= 1000) return `${(sbtc / 1000).toFixed(1)}K`;
  if (sbtc >= 1) return sbtc.toFixed(2);
  if (sbtc >= 0.001) return sbtc.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return sbtc.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}
