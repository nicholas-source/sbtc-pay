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
 * Return the shared Supabase client with a per-request wallet header for RLS.
 * Uses a single GoTrueClient instance to avoid the "multiple instances" warning.
 * The x-wallet-address header is set globally (last caller wins) — this is fine
 * because the frontend only ever has one connected wallet at a time.
 */
let currentWallet = "";

export function supabaseWithWallet(walletAddress: string) {
  if (walletAddress !== currentWallet) {
    currentWallet = walletAddress;
    // Update the global headers on the existing client
    // @ts-expect-error — accessing internal rest client headers
    supabase.rest.headers["x-wallet-address"] = walletAddress;
  }
  return supabase;
}
