-- Close the payment_index race, and add the two integrity constraints mainnet
-- was missing relative to testnet.
--
-- backfill_payment() picks its index with:
--     SELECT COALESCE(MAX(payment_index), -1) + 1 ... WHERE invoice_id = ?
-- Two concurrent calls for the same invoice both read the same MAX and both
-- insert the same payment_index. On testnet a UNIQUE (invoice_id,
-- payment_index) rejected the second; mainnet never had that constraint, so
-- the duplicate landed silently. On a payments ledger that is the worst shape
-- of bug: no error, no alert, just a wrong row.
--
-- The function is reachable from the client reconcile path
-- (src/stores/invoice-store.ts:372 and :396), which fires per missing payment,
-- so concurrent calls for one invoice are a realistic pattern rather than a
-- theoretical one.
--
-- Adding the constraint alone would be a poor fix: it converts a silent
-- duplicate into an unhandled exception. backfill_payment returns status
-- STRINGS ('inserted' / 'duplicate' / 'denied') and its callers check
-- `error`, so a raised unique_violation would surface as a failed RPC rather
-- than a handled outcome. The function is therefore updated alongside it.
--
-- The retry distinguishes two cases that a bare constraint conflates:
--   * same tx_id already present  -> genuinely the same payment. Return
--     'duplicate', matching the existing pre-check.
--   * index collision, new tx_id  -> two DIFFERENT real payments that merely
--     raced. Dropping one would lose a payment, so recompute the index and
--     retry rather than give up.

------------------------------------------------------------------------
-- 1. Constraints (idempotent — testnet already carries both)
------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.conname = 'payments_invoice_id_payment_index_key'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_invoice_id_payment_index_key
      UNIQUE (invoice_id, payment_index);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'public' AND c.conname = 'platform_stats_id_check'
  ) THEN
    -- platform_stats is a singleton; nothing should ever create a second row.
    ALTER TABLE public.platform_stats
      ADD CONSTRAINT platform_stats_id_check CHECK (id = 1);
  END IF;
END $$;

------------------------------------------------------------------------
-- 2. Make backfill_payment race-safe
------------------------------------------------------------------------
-- Signature unchanged, so CREATE OR REPLACE is sufficient and preserves the
-- existing ACL. Grants are re-asserted below regardless — see the note there.
CREATE OR REPLACE FUNCTION public.backfill_payment(
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
  v_attempt    integer;
BEGIN
  SELECT merchant_principal INTO v_merchant FROM invoices WHERE id = p_invoice_id;
  IF v_merchant IS NULL THEN RETURN 'denied'; END IF;

  v_caller := public.requesting_wallet_address();
  IF v_caller IS NULL OR v_caller <> v_merchant THEN RETURN 'denied'; END IF;

  IF p_tx_id IS NOT NULL AND p_tx_id <> '' THEN
    SELECT EXISTS(SELECT 1 FROM payments WHERE tx_id = p_tx_id) INTO v_exists;
    IF v_exists THEN RETURN 'duplicate'; END IF;
  END IF;

  IF p_fee IS NOT NULL THEN
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

  -- Bounded retry: recompute the index each pass, because a concurrent
  -- backfill may have taken it between our SELECT and our INSERT.
  FOR v_attempt IN 1..5 LOOP
    SELECT COALESCE(MAX(payment_index), -1) + 1 INTO v_pay_index
    FROM payments WHERE invoice_id = p_invoice_id;

    BEGIN
      INSERT INTO payments (invoice_id, payment_index, payer, merchant_principal,
                            amount, fee, merchant_received, block_height, tx_id, token_type)
      VALUES (p_invoice_id, v_pay_index, p_payer, v_merchant,
              p_amount, v_fee, v_received, p_block_height, NULLIF(p_tx_id, ''), p_token_type);

      RETURN 'inserted';

    EXCEPTION WHEN unique_violation THEN
      -- Same tx_id already recorded: this really is the same payment, and the
      -- pre-check above simply lost a race with a concurrent insert.
      IF p_tx_id IS NOT NULL AND p_tx_id <> ''
         AND EXISTS (SELECT 1 FROM payments WHERE tx_id = p_tx_id) THEN
        RETURN 'duplicate';
      END IF;
      -- Otherwise the collision was on payment_index for a different payment.
      -- Fall through and retry with a freshly computed index.
    END;
  END LOOP;

  -- Five straight collisions is not contention, it is something wrong.
  -- Report rather than loop forever or insert something incorrect.
  RETURN 'conflict';
END;
$function$;

------------------------------------------------------------------------
-- 3. Re-assert grants
------------------------------------------------------------------------
-- CREATE OR REPLACE preserves an existing function's ACL, so this should be a
-- no-op. It is stated explicitly because Supabase's ALTER DEFAULT PRIVILEGES
-- grants EXECUTE on new functions directly to anon (see pg_default_acl), and
-- migration 026 was caught out by exactly that: a REVOKE ... FROM PUBLIC there
-- looked correct while leaving anon's direct grant untouched. Naming anon is
-- the only reliable way to keep migration 020's lockdown intact.
REVOKE ALL ON FUNCTION public.backfill_payment(integer, text, bigint, text, integer, text, bigint, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_payment(integer, text, bigint, text, integer, text, bigint, bigint) TO authenticated, service_role;
