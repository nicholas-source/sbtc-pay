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
 * Create a Supabase client instance that includes the connected wallet address
 * in request headers for RLS policy evaluation.
 * Clients are cached per address to avoid re-creating on every call.
 */
const walletClientCache = new Map<string, ReturnType<typeof createClient<Database>>>();

export function supabaseWithWallet(walletAddress: string) {
  const cached = walletClientCache.get(walletAddress);
  if (cached) return cached;

  const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        "x-wallet-address": walletAddress,
      },
    },
  });
  walletClientCache.set(walletAddress, client);
  return client;
}
