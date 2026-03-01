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
