import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { getStoredAuth, SUPABASE_URL, SUPABASE_ANON_KEY } from "./auth";

// Token storage + the signature-for-JWT exchange live in ./auth, which has no
// @supabase/supabase-js import — wallet-store uses those on every route, and
// this module (the actual clients) should only load when data access starts.

// Unauthenticated client for public reads (e.g. pay page invoice lookup)
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

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
