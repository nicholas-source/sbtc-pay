import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing Supabase environment variables: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY"
  );
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Return a Supabase client that sends the x-wallet-address header for RLS.
 * Uses a SINGLE cached client with auth disabled (no session, no refresh)
 * to avoid the "Multiple GoTrueClient instances" warning.
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
    },
  });
  return walletClient;
}
