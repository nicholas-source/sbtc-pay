/**
 * Centralized constants for the sBTC Pay platform.
 *
 * All USD conversion uses live prices from wallet-store (Coinbase/CoinGecko).
 * When prices haven't loaded yet, USD functions return "\u2014" (em-dash).
 */

export const SATS_PER_BTC = 100_000_000;
export const MICRO_STX_PER_STX = 1_000_000;

/**
 * Convert sats to an approximate USD string. Returns \"\u2014\" if rate is null.
 */
export function satsToUsd(sats: number, rate: number | null): string {
  if (rate === null) return '\u2014';
  if (!Number.isFinite(sats)) return '0.00';
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

// ── STX denomination helpers ──────────────────────────────────────

/**
 * Convert microSTX (integer) to STX (decimal).
 * 1 STX = 1,000,000 microSTX (6 decimal places).
 */
export function microStxToStx(microStx: number): number {
  return microStx / MICRO_STX_PER_STX;
}

/**
 * Convert STX (decimal) to microSTX (integer).
 */
export function stxToMicroStx(stx: number): number {
  return Math.round(stx * MICRO_STX_PER_STX);
}

/**
 * Convert microSTX to an approximate USD string. Returns \"\u2014\" if price is null.
 */
export function microStxToUsd(microStx: number, stxPriceUsd: number | null): string {
  if (stxPriceUsd === null) return '\u2014';
  if (!Number.isFinite(microStx)) return '0.00';
  return (microStxToStx(microStx) * stxPriceUsd).toFixed(2);
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
  if (!Number.isFinite(sats) || sats === 0) return "0";
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
  if (!Number.isFinite(sats) || sats === 0) return "0.00000000";
  return satsToSbtc(sats).toFixed(8);
}

/**
 * Abbreviate an sBTC amount for compact display (charts, stat cards).
 */
export function formatSbtcCompact(sats: number): string {
  if (!Number.isFinite(sats) || sats === 0) return "0";
  const sbtc = satsToSbtc(sats);
  if (sbtc >= 1000) return `${(sbtc / 1000).toFixed(1)}K`;
  if (sbtc >= 1) return sbtc.toFixed(2);
  if (sbtc >= 0.001) return sbtc.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return sbtc.toFixed(8).replace(/0+$/, "").replace(/\.$/, "");
}

// ── STX formatting ──────────────────────────────────────────────────

/**
 * Format microSTX as STX display string.
 * Smart formatting similar to formatSbtc but for 6 decimal places.
 */
export function formatStx(microStx: number): string {
  if (!Number.isFinite(microStx) || microStx === 0) return "0";
  if (microStx < 1000) return `${microStx} µSTX`;
  const stx = microStxToStx(microStx);
  if (stx >= 1) return stx.toFixed(2);
  const decimals = stx >= 0.001 ? 4 : 6;
  return stx.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Format microSTX as STX with full 6-decimal precision.
 */
export function formatStxFull(microStx: number): string {
  if (!Number.isFinite(microStx) || microStx === 0) return "0.000000";
  return microStxToStx(microStx).toFixed(6);
}

/**
 * Abbreviate STX amount for compact display.
 */
export function formatStxCompact(microStx: number): string {
  if (!Number.isFinite(microStx) || microStx === 0) return "0";
  const stx = microStxToStx(microStx);
  if (stx >= 1000) return `${(stx / 1000).toFixed(1)}K`;
  if (stx >= 1) return stx.toFixed(2);
  if (stx >= 0.001) return stx.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  return stx.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

// ── Token-agnostic formatting ────────────────────────────────────────

import type { TokenType } from './stacks/config';
export type { TokenType };

/**
 * Format an amount in base units (sats or microSTX) for display,
 * routing to the correct formatter based on token type.
 */
export function formatAmount(amount: number, tokenType: TokenType): string {
  return tokenType === 'stx' ? formatStx(amount) : formatSbtc(amount);
}

/**
 * Format amount with full precision based on token type.
 */
export function formatAmountFull(amount: number, tokenType: TokenType): string {
  return tokenType === 'stx' ? formatStxFull(amount) : formatSbtcFull(amount);
}

/**
 * Format amount compact based on token type.
 */
export function formatAmountCompact(amount: number, tokenType: TokenType): string {
  return tokenType === 'stx' ? formatStxCompact(amount) : formatSbtcCompact(amount);
}

/**
 * Convert amount to USD based on token type.
 * Returns "—" when prices haven't loaded yet (null).
 */
export function amountToUsd(
  amount: number,
  tokenType: TokenType,
  btcPriceUsd: number | null = null,
  stxPriceUsd: number | null = null,
): string {
  if (tokenType === 'stx') return microStxToUsd(amount, stxPriceUsd);
  return satsToUsd(amount, btcPriceUsd !== null ? btcPriceUsd / SATS_PER_BTC : null);
}

/**
 * Get the display name for a token type.
 */
export function tokenLabel(tokenType: TokenType): string {
  return tokenType === 'stx' ? 'STX' : 'sBTC';
}

/**
 * Convert human-readable amount to base units (sats or microSTX).
 */
export function humanToBaseUnits(amount: number, tokenType: TokenType): number {
  return tokenType === 'stx' ? stxToMicroStx(amount) : sbtcToSats(amount);
}

/**
 * Convert base units (sats or microSTX) to human-readable amount.
 */
export function baseToHuman(amount: number, tokenType: TokenType): number {
  return tokenType === 'stx' ? microStxToStx(amount) : satsToSbtc(amount);
}
