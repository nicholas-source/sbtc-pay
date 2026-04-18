import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  );
}

// We don't use Supabase Auth (wallet-based auth via JWT from wallet-auth edge function),
// so both clients disable session persistence to avoid GoTrueClient conflicts.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/**
 * Return a Supabase client authenticated with a wallet JWT (if available)
 * or falling back to x-wallet-address header.
 * Cached per wallet address + token. Uses a distinct storageKey to prevent
 * GoTrueClient "Multiple instances" warning.
 */
let walletClient: ReturnType<typeof createClient<Database>> | null = null;
let currentWallet = "";
let currentToken = "";

/** Set the JWT obtained from the wallet-auth edge function. Resets the cached client. */
export function setAuthToken(token: string | null) {
  currentToken = token ?? "";
  // Invalidate cached client so it gets rebuilt with the new token
  walletClient = null;
  currentWallet = "";
}

/** Get the current auth token (for making other authenticated requests). */
export function getAuthToken(): string | null {
  return currentToken || null;
}

export function supabaseWithWallet(walletAddress: string) {
  if (!walletAddress) return supabase;
  if (walletClient && walletAddress === currentWallet && currentToken === (walletClient as unknown as { _token?: string })._token) {
    return walletClient;
  }

  currentWallet = walletAddress;
  const headers: Record<string, string> = currentToken
    ? { Authorization: `Bearer ${currentToken}` }
    : { "x-wallet-address": walletAddress };

  walletClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "sb-wallet-auth",
    },
  });
  // Track which token was used to build this client
  (walletClient as unknown as { _token?: string })._token = currentToken;
  return walletClient;
}
