import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  );
}

// We don't use Supabase Auth (wallet-based auth via x-wallet-address header),
// so both clients disable session persistence to avoid GoTrueClient conflicts.
export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

/**
 * Return a Supabase client that sends the x-wallet-address header for RLS.
 * Cached per wallet address. Uses a distinct storageKey to prevent
 * GoTrueClient "Multiple instances" warning.
 */
let walletClient: ReturnType<typeof createClient<Database>> | null = null;
let currentWallet = "";

export function supabaseWithWallet(walletAddress: string) {
  if (!walletAddress) return supabase;
  if (walletClient && walletAddress === currentWallet) return walletClient;

  currentWallet = walletAddress;
  walletClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: { "x-wallet-address": walletAddress },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "sb-wallet-auth",
    },
  });
  return walletClient;
}
