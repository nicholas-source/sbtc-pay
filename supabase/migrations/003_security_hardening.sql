-- Migration: Security hardening
-- 1. Upgrade increment_merchant_received to support per-token columns
-- 2. Revoke dangerous grants on security definer functions
-- 3. Drop old 2-arg overload of increment_merchant_received

-- Replace increment_merchant_received with per-token version
CREATE OR REPLACE FUNCTION public.increment_merchant_received(p_principal text, p_amount bigint, p_token_type text DEFAULT 'sbtc')
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  IF p_token_type = 'stx' THEN
    UPDATE public.merchants
    SET total_received_stx = total_received_stx + p_amount,
        total_received = total_received + p_amount,
        updated_at = now()
    WHERE principal = p_principal;
  ELSE
    UPDATE public.merchants
    SET total_received_sbtc = total_received_sbtc + p_amount,
        total_received = total_received + p_amount,
        updated_at = now()
    WHERE principal = p_principal;
  END IF;
END;
$function$;
-- Drop old 2-arg overload
DROP FUNCTION IF EXISTS public.increment_merchant_received(text, bigint);
-- Revoke anon/authenticated/public from privileged functions
REVOKE EXECUTE ON FUNCTION public.increment_merchant_received(text, bigint, text) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_merchant_received(text, bigint, text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.increment_platform_stat(text, bigint) FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_platform_stat(text, bigint) TO service_role;
-- sync_merchant_cache: remove PUBLIC, keep anon/authenticated (frontend needs it)
REVOKE EXECUTE ON FUNCTION public.sync_merchant_cache(integer, text, text, text, text, text, boolean, boolean, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sync_merchant_cache(integer, text, text, text, text, text, boolean, boolean, bigint) TO anon, authenticated, service_role;
