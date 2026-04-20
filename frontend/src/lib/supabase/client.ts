import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  );
}

// Unauthenticated client for public reads (e.g. pay page invoice lookup)
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// ── Wallet JWT auth ─────────────────────────────────────────────────────────
// On wallet connect, we sign a message once and get a 24h JWT from the
// wallet-auth edge function. The JWT is stored in localStorage and used as
// the Authorization header for all authenticated Supabase calls.
// RLS policies read the wallet address from auth.jwt()->>'sub'.

const JWT_STORAGE_KEY = "sbtc-pay-wallet-jwt";
const JWT_ADDRESS_KEY = "sbtc-pay-wallet-jwt-addr";

interface StoredAuth {
  token: string;
  expiresAt: number; // epoch ms
  address: string;
}

function getStoredAuth(): StoredAuth | null {
  try {
    const token = localStorage.getItem(JWT_STORAGE_KEY);
    const address = localStorage.getItem(JWT_ADDRESS_KEY);
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
  localStorage.setItem(JWT_STORAGE_KEY, token);
  localStorage.setItem(JWT_ADDRESS_KEY, address);
}

function clearStoredAuth() {
  localStorage.removeItem(JWT_STORAGE_KEY);
  localStorage.removeItem(JWT_ADDRESS_KEY);
}

/**
 * Authenticate a wallet by signing a message and exchanging it for a JWT.
 * Returns the JWT token, or throws on failure.
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

/** Clear stored auth on disconnect. */
export function clearWalletAuth() {
  clearStoredAuth();
  walletClient = null;
  currentWallet = "";
}

/**
 * Return a Supabase client authenticated with the wallet JWT for RLS.
 * Falls back to x-wallet-address header if no JWT is available yet
 * (e.g. during the brief window between connect and sign).
 */
let walletClient: ReturnType<typeof createClient<Database>> | null = null;
let currentWallet = "";
let currentToken = "";

export function supabaseWithWallet(walletAddress: string) {
  if (!walletAddress) return supabase;

  const stored = getStoredAuth();
  const token = stored?.address === walletAddress ? stored.token : "";

  // Reuse cached client if same wallet + same token
  if (walletClient && walletAddress === currentWallet && token === currentToken) {
    return walletClient;
  }

  currentWallet = walletAddress;
  currentToken = token;

  if (token) {
    // Authenticated: use JWT as Authorization header
    walletClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "sb-wallet-auth",
      },
    });
  } else {
    // No valid JWT — return anon client (RLS will restrict access)
    return supabase;
  }
  return walletClient;
}
