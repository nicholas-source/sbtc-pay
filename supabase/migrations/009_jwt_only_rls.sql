-- Migration 009: Remove x-wallet-address header fallback from RLS
-- 
-- Previously, requesting_wallet_address() fell back to the x-wallet-address
-- header when no JWT was present. That header is trivially spoofable by any
-- client, allowing impersonation of any merchant address.
--
-- Now that the frontend uses sign-once JWT auth (wallet-auth edge function),
-- we remove the header fallback so RLS only trusts the cryptographically
-- verified JWT sub claim.

CREATE OR REPLACE FUNCTION public.requesting_wallet_address()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(auth.jwt()->>'sub', '');
$$;
