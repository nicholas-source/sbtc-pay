-- Lock down SECURITY DEFINER RPCs that should not be reachable from the
-- public anon key, and tighten sync_merchant_cache which had no auth check
-- at all.
--
-- Background: Supabase grants EXECUTE on every function in `public` to
-- PUBLIC by default, which includes anon and authenticated. The security
-- advisor flagged four SECURITY DEFINER functions reachable by anon.
-- On review:
--
--   - backfill_payment / backfill_refund: already check
--     requesting_wallet_address() = merchant_principal internally, so cross-
--     merchant abuse is blocked. Still, anon has no business calling them.
--   - rls_auto_enable: event-trigger handler whose body is a no-op outside
--     a DDL context. Harmless in practice, but should not be callable.
--   - sync_merchant_cache: NO internal auth. Anyone holding the anon key
--     could overwrite any merchant's webhook_url, name, is_verified, etc.
--     until chainhook re-synced from on-chain. Webhook URL diversion is
--     the concrete harm.
--
-- Fix shape:
--   1. Rewrite sync_merchant_cache so authenticated wallets can only sync
--      their own row, and is_verified is never trusted from the caller
--      (only chainhook, via service_role + direct UPDATE, sets is_verified).
--   2. Revoke EXECUTE from anon on all four. Keep authenticated for the
--      two backfill_* and sync_merchant_cache (frontend uses them).
--      Revoke authenticated on rls_auto_enable too — nobody should call it.
--   3. service_role keeps EXECUTE on everything, so chainhook is unaffected.

-- 1. Rewrite sync_merchant_cache with wallet-match auth and is_verified
--    lock-down. Service_role has no wallet claim, so its calls bypass the
--    check (preserved behaviour). is_verified is forced to false on insert
--    and not updated on conflict — chainhook owns that field.
CREATE OR REPLACE FUNCTION public.sync_merchant_cache(
  p_id integer,
  p_principal text,
  p_name text,
  p_description text DEFAULT NULL,
  p_logo_url text DEFAULT NULL,
  p_webhook_url text DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_is_verified boolean DEFAULT false,  -- preserved for signature compat; ignored
  p_registered_at bigint DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_caller text;
BEGIN
  v_caller := public.requesting_wallet_address();
  -- If a wallet JWT is present, it must match the principal being synced.
  -- Service_role (chainhook) has no wallet claim → v_caller IS NULL → allowed.
  IF v_caller IS NOT NULL AND v_caller <> p_principal THEN
    RAISE EXCEPTION 'denied: wallet does not match merchant principal';
  END IF;

  INSERT INTO public.merchants (
    id, principal, name, description, logo_url, webhook_url,
    is_active, is_verified, registered_at
  )
  VALUES (
    p_id, p_principal, p_name, p_description, p_logo_url, p_webhook_url,
    p_is_active, false, p_registered_at  -- is_verified forced false on insert
  )
  ON CONFLICT (id) DO UPDATE SET
    name         = EXCLUDED.name,
    description  = EXCLUDED.description,
    logo_url     = EXCLUDED.logo_url,
    webhook_url  = EXCLUDED.webhook_url,
    is_active    = EXCLUDED.is_active,
    -- is_verified intentionally NOT in the SET list; only chainhook updates it
    updated_at   = now();
END;
$$;

-- 2. Tighten EXECUTE grants. service_role keeps EXECUTE on all of these
--    (service_role bypasses standard grants).
REVOKE EXECUTE ON FUNCTION public.sync_merchant_cache(
  integer, text, text, text, text, text, boolean, boolean, bigint
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.backfill_payment(
  integer, text, bigint, text, integer, text
) FROM anon;

REVOKE EXECUTE ON FUNCTION public.backfill_refund(
  integer, bigint, text, text, integer, text
) FROM anon;

-- rls_auto_enable grant shape diverges between environments: testnet had
-- a PUBLIC grant only, mainnet had direct anon + authenticated grants and
-- no PUBLIC grant. Revoke all three to cover both cases — service_role
-- retains EXECUTE via its own direct grant.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;
