/**
 * Wallet JWT auth — token storage and the signature-for-JWT exchange.
 *
 * Deliberately free of any @supabase/supabase-js import: wallet-store loads
 * eagerly on every route (including the landing page), and these helpers are
 * all it needs. Keeping them here keeps the ~55KB gz vendor-supabase chunk
 * out of the initial bundle; the actual Supabase clients live in ./client.
 *
 * Flow: on wallet connect we sign a message once and exchange it for a 24h
 * JWT from the wallet-auth edge function. The JWT is stored in localStorage
 * and used as the Authorization header for authenticated Supabase calls.
 * RLS policies read the wallet address from auth.jwt()->>'sub'.
 */
import { safeStorage } from "@/lib/safe-storage";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  );
}

const JWT_STORAGE_KEY = "sbtc-pay-wallet-jwt";
const JWT_ADDRESS_KEY = "sbtc-pay-wallet-jwt-addr";

interface StoredAuth {
  token: string;
  expiresAt: number; // epoch ms
  address: string;
}

export function getStoredAuth(): StoredAuth | null {
  try {
    const token = safeStorage.get(JWT_STORAGE_KEY);
    const address = safeStorage.get(JWT_ADDRESS_KEY);
    if (!token || !address) return null;

    // Decode JWT payload to check expiry
    const payload = JSON.parse(atob(token.split(".")[1]));
    const expiresAt = (payload.exp ?? 0) * 1000;

    // Consider expired if less than 5 minutes remaining
    if (Date.now() > expiresAt - 5 * 60 * 1000) {
      clearStoredAuth();
      return null;
    }

    return { token, expiresAt, address };
  } catch {
    clearStoredAuth();
    return null;
  }
}

function storeAuth(token: string, address: string) {
  safeStorage.set(JWT_STORAGE_KEY, token);
  safeStorage.set(JWT_ADDRESS_KEY, address);
}

function clearStoredAuth() {
  safeStorage.remove(JWT_STORAGE_KEY);
  safeStorage.remove(JWT_ADDRESS_KEY);
}

/**
 * Authenticate a wallet by signing a message and exchanging it for a JWT.
 * Returns the JWT token, or throws on failure. Plain fetch — no client needed.
 */
export async function authenticateWallet(
  address: string,
  signMessage: (message: string) => Promise<{ signature: string }>,
): Promise<string> {
  // Check if we already have a valid JWT for this address
  const stored = getStoredAuth();
  if (stored && stored.address === address) {
    return stored.token;
  }

  // Build message with timestamp for replay protection
  const timestamp = Date.now();
  const message = `Sign in to sBTC Pay\nAddress: ${address}\nTimestamp: ${timestamp}`;

  // Request signature from wallet (one popup)
  const { signature } = await signMessage(message);

  // Exchange signature for JWT via edge function
  const res = await fetch(`${SUPABASE_URL}/functions/v1/wallet-auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ message, signature, address }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Authentication failed" }));
    throw new Error(err.error || "Wallet authentication failed");
  }

  const { token } = await res.json();
  storeAuth(token, address);
  return token;
}

/** Check if a valid JWT exists for the given address (no wallet interaction). */
export function hasValidAuth(address: string): boolean {
  const stored = getStoredAuth();
  return !!stored && stored.address === address;
}

/**
 * Clear stored auth on disconnect. Storage-only: supabaseWithWallet re-reads
 * the token on every call and falls back to the anon client once it's gone,
 * so there is no client-side cache to reset here.
 */
export function clearWalletAuth() {
  clearStoredAuth();
}
