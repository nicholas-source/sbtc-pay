-- Stop backfill_payment() inventing a platform fee.
--
-- The function hardcoded the fee at 50 bps:
--     v_fee := (p_amount * 50) / 10000;
--     v_received := p_amount - v_fee;
--
-- The contract's fee is a mutable data-var, not a constant. It was changed
-- on-chain from 50 bps to 0 on 2026-06-15 (events.platform-fee-updated:
-- {"old-fee-bps":50,"new-fee-bps":0}), and a live read of get-contract-config
-- on SPR54P37AA27XHMMTCDEW4YZFPFJX69162JR5CT4.sbtc-pay confirms
-- platform-fee-bps = 0. So the function has been wrong since that date.
--
-- This is NOT dormant code. src/stores/invoice-store.ts:372 and :396 call it
-- from the client reconcile path whenever chainhook has missed a payment. It
-- has not fired since the fee change — no payment row after 2026-06-15 carries
-- a non-zero fee — but it is armed, and the next miss would insert a payment
-- with a fabricated 0.5% fee and a correspondingly understated
-- merchant_received. On a payments ledger that is a real integrity defect.
--
-- Fix, in order of preference:
--
--   1. Take the authoritative values from the caller. The chain event already
--      carries them exactly — payment-received prints {fee, merchant-received}
--      alongside amount — so nothing has to be derived. New optional
--      p_fee / p_merchant_received parameters accept them.
--
--   2. Fall back to platform_config.platform_fee_bps, seeded here from the
--      verified on-chain value.
--
--   3. If neither is available, RAISE. Refusing to write is correct; guessing
--      a fee is what caused this. The old code's silent hardcode is exactly
--      the failure mode being removed, so it is not replaced with a new one.
--
-- Note that (2) is still a cache and can go stale the same way the constant
-- did. It is a floor, not the destination. The durable fix is (1) — the caller
-- passing what the chain reported — which needs fetchPaymentEventsForInvoice()
-- in src/lib/stacks/contract.ts to surface `fee`, since it currently returns
-- only {txId, timestamp, amount, payer}. Tracked separately.

------------------------------------------------------------------------
-- 1. Seed the fee cache from verified on-chain state
------------------------------------------------------------------------
INSERT INTO public.platform_config (key, value)
VALUES ('platform_fee_bps', '0')
ON CONFLICT (key) DO NOTHING;

------------------------------------------------------------------------
-- 2. Replace backfill_payment
------------------------------------------------------------------------
-- Dropped rather than CREATE OR REPLACE: adding defaulted parameters creates a
-- second overload rather than replacing, which would leave six-argument calls
-- ambiguous. DROP also discards grants, so they are re-issued below.
DROP FUNCTION IF EXISTS public.backfill_payment(integer, text, bigint, text, integer, text);

CREATE FUNCTION public.backfill_payment(
  p_invoice_id        integer,
  p_payer             text,
  p_amount            bigint,
  p_tx_id             text,
  p_block_height      integer,
  p_token_type        text   DEFAULT 'sbtc',
  p_fee               bigint DEFAULT NULL,
  p_merchant_received bigint DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_merchant   text;
  v_caller     text;
  v_exists     boolean;
  v_pay_index  integer;
  v_fee        bigint;
  v_received   bigint;
  v_fee_bps    bigint;
BEGIN
  SELECT merchant_principal INTO v_merchant FROM invoices WHERE id = p_invoice_id;
  IF v_merchant IS NULL THEN RETURN 'denied'; END IF;

  -- Unchanged from the original: caller must be the invoice's merchant.
  v_caller := public.requesting_wallet_address();
  IF v_caller IS NULL OR v_caller <> v_merchant THEN RETURN 'denied'; END IF;

  IF p_tx_id IS NOT NULL AND p_tx_id <> '' THEN
    SELECT EXISTS(SELECT 1 FROM payments WHERE tx_id = p_tx_id) INTO v_exists;
    IF v_exists THEN RETURN 'duplicate'; END IF;
  END IF;

  IF p_fee IS NOT NULL THEN
    -- Preferred path: the caller observed these on chain.
    v_fee      := p_fee;
    v_received := COALESCE(p_merchant_received, p_amount - p_fee);
  ELSE
    SELECT value::bigint INTO v_fee_bps
    FROM platform_config WHERE key = 'platform_fee_bps';

    IF v_fee_bps IS NULL THEN
      RAISE EXCEPTION
        'backfill_payment: no fee available. Pass p_fee from the chain event, '
        'or set platform_config.platform_fee_bps. Refusing to guess.';
    END IF;

    v_fee      := (p_amount * v_fee_bps) / 10000;
    v_received := p_amount - v_fee;
  END IF;

  SELECT COALESCE(MAX(payment_index), -1) + 1 INTO v_pay_index
  FROM payments WHERE invoice_id = p_invoice_id;

  INSERT INTO payments (invoice_id, payment_index, payer, merchant_principal,
                        amount, fee, merchant_received, block_height, tx_id, token_type)
  VALUES (p_invoice_id, v_pay_index, p_payer, v_merchant,
          p_amount, v_fee, v_received, p_block_height, NULLIF(p_tx_id, ''), p_token_type);

  RETURN 'inserted';
END;
$function$;

------------------------------------------------------------------------
-- 3. Restore grants (DROP FUNCTION discarded them)
------------------------------------------------------------------------
-- Matches the posture migration 020 established: anon is deliberately excluded;
-- authenticated keeps EXECUTE because the client reconcile path calls this, and
-- the function enforces caller-is-merchant internally.
--
-- REVOKE FROM PUBLIC is NOT sufficient here, and assuming it was is a trap this
-- migration originally fell into. Supabase ships
--     ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS
--       TO postgres, anon, authenticated, service_role
-- (visible in pg_default_acl), so CREATE FUNCTION grants EXECUTE to anon
-- *directly*, not through PUBLIC. Revoking PUBLIC leaves that direct grant
-- untouched. anon must therefore be named explicitly.
--
-- Consequence worth remembering: every CREATE OR REPLACE of a function in this
-- schema silently re-grants anon, quietly undoing migration 020. Any future
-- migration that recreates a SECURITY DEFINER function must re-revoke anon.
REVOKE ALL ON FUNCTION public.backfill_payment(integer, text, bigint, text, integer, text, bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_payment(integer, text, bigint, text, integer, text, bigint, bigint) TO authenticated, service_role;
