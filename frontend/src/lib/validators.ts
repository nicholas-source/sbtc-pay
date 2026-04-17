/**
 * Stacks address validation utility.
 *
 * Mainnet addresses start with SP or SM, testnet with ST or SN.
 * Addresses are 39–41 characters, using the Crockford Base32 alphabet.
 */

const STACKS_ADDR_RE = /^S[PMTN][0-9A-HJ-NP-Z]{33,39}$/;

/** Returns true if `addr` looks like a valid Stacks address (mainnet or testnet). */
export function isValidStacksAddress(addr: string): boolean {
  return STACKS_ADDR_RE.test(addr);
}

/** Validates the given address and returns an error message, or null if valid. */
export function validateStacksAddress(addr: string): string | null {
  if (!addr.trim()) return "Address is required";
  if (!isValidStacksAddress(addr.trim())) return "Invalid Stacks address (must start with SP, SM, ST, or SN)";
  return null;
}
