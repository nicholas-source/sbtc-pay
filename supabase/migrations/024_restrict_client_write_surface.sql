-- Restrict the client-facing write surface on merchants and invoices.
--
-- Migration 020 locked down sync_merchant_cache so a wallet could only sync its
-- own merchant row, and explicitly refused to trust `is_verified` from the
-- caller: "is_verified is never trusted from the caller (only chainhook, via
-- service_role + direct UPDATE, sets is_verified)."
--
-- That held for the RPC. It did not hold for the Data API, because the default
-- Supabase grants left anon/authenticated holding table-wide UPDATE:
--
--   merchants   UPDATE on all 20 columns, incl. is_verified, total_received_*,
--               invoice_count, subscription_count
--   invoices    UPDATE on all 19 columns, incl. amount, amount_paid, status,
--               amount_refunded, merchant_principal
--
-- combined with RLS policies whose WITH CHECK is NULL, so they inherit USING.
-- That constrains *which row* you may touch (your own) but places no constraint
-- on *what you may write into it*. There are no triggers on either table. So:
--
--   PATCH /rest/v1/merchants?principal=eq.<self>  {"is_verified": true}
--
-- satisfies every check and self-grants the verified badge — the exact control
-- 020 intended to enforce, reachable by the path 020 did not cover.
--
-- Scope was derived from the actual client code, not assumed:
--   * frontend never issues a direct UPDATE against merchants. Profile edits go
--     through updateMerchantOnChain() then the sync_merchant_cache RPC
--     (src/stores/merchant-store.ts:114-150). Revoking UPDATE costs nothing.
--   * frontend does issue a direct UPDATE against invoices, in the reconcile
--     background-fix path (src/stores/invoice-store.ts:331-341,470). It writes
--     exactly six columns, so the grant is narrowed to those six rather than
--     removed.
--
-- service_role is untouched throughout: chainhook and reconcile keep full write
-- access, and service_role bypasses RLS regardless.

------------------------------------------------------------------------
-- 1. merchants — remove the client write path entirely
------------------------------------------------------------------------
REVOKE UPDATE ON public.merchants FROM anon, authenticated;

-- The "Merchants update own record" policy is left in place but is now inert:
-- with no UPDATE grant, RLS is never consulted. It is retained so that
-- re-granting specific columns later does not also require recreating the
-- policy. Anything that needs to write here should use sync_merchant_cache.

------------------------------------------------------------------------
-- 2. invoices — narrow from table-wide to the six reconciled columns
------------------------------------------------------------------------
REVOKE UPDATE ON public.invoices FROM anon, authenticated;

-- anon is deliberately not re-granted: requesting_wallet_address() reads
-- auth.jwt()->>'sub', which is NULL for anon, so the RLS policy
-- (merchant_principal = requesting_wallet_address()) can never match for anon
-- anyway. Removing the grant makes that explicit instead of incidental.
GRANT UPDATE (amount, amount_paid, status, memo, payer, token_type)
  ON public.invoices TO authenticated;

-- NOTE — this narrows blast radius; it does not make the invoice cache
-- authoritative-safe. A merchant can still write amount/amount_paid/status on
-- their own invoice, because the client is trusted to repair those columns.
-- Closing that fully means removing the client-side background fix and letting
-- the chainhook + reconcile pipeline be the sole writer. That is a behavioural
-- change to the reconcile path, so it is deliberately NOT bundled here.
