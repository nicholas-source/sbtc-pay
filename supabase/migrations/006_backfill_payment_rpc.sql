-- Backfill missing payment rows from client-side reconciliation
--
-- When chainhook misses a payment event (or is delayed), the client detects the
-- mismatch between Supabase payments sum and on-chain amountPaid.  It fetches
-- the real payment data from the Hiro API and calls this RPC to persist it.
--
-- Security:
--   - SECURITY DEFINER: runs as the function owner, bypassing RLS
--   - Validates the caller is the invoice's merchant via requesting_wallet_address()
--   - Deduplicates by tx_id to prevent double-inserts

CREATE OR REPLACE FUNCTION public.backfill_payment(
  p_invoice_id   integer,
  p_payer        text,
  p_amount       bigint,
  p_tx_id        text,
  p_block_height integer,
  p_token_type   text DEFAULT 'sbtc'
)
RETURNS text  -- 'inserted', 'duplicate', or 'denied'
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant   text;
  v_caller     text;
  v_exists     boolean;
  v_pay_index  integer;
  v_fee        bigint;
  v_received   bigint;
BEGIN
  -- 1. Verify the invoice exists and get its merchant
  SELECT merchant_principal INTO v_merchant
    FROM invoices
   WHERE id = p_invoice_id;

  IF v_merchant IS NULL THEN
    RETURN 'denied';
  END IF;

  -- 2. Verify the caller is the merchant
  v_caller := public.requesting_wallet_address();
  IF v_caller IS NULL OR v_caller <> v_merchant THEN
    RETURN 'denied';
  END IF;

  -- 3. Dedup: skip if a payment with this tx_id already exists
  IF p_tx_id IS NOT NULL AND p_tx_id <> '' THEN
    SELECT EXISTS(
      SELECT 1 FROM payments WHERE tx_id = p_tx_id
    ) INTO v_exists;

    IF v_exists THEN
      RETURN 'duplicate';
    END IF;
  END IF;

  -- 4. Calculate fee (0.5% = 50 BPS, matching contract FEE-BPS)
  v_fee := (p_amount * 50) / 10000;
  v_received := p_amount - v_fee;

  -- 5. Get next payment_index for this invoice
  SELECT COALESCE(MAX(payment_index), -1) + 1 INTO v_pay_index
    FROM payments
   WHERE invoice_id = p_invoice_id;

  -- 6. Insert
  INSERT INTO payments (
    invoice_id, payment_index, payer, merchant_principal,
    amount, fee, merchant_received, block_height, tx_id, token_type
  ) VALUES (
    p_invoice_id, v_pay_index, p_payer, v_merchant,
    p_amount, v_fee, v_received, p_block_height, NULLIF(p_tx_id, ''), p_token_type
  );

  RETURN 'inserted';
END;
$$;

-- Ensure refunds.id has an auto-increment default
CREATE SEQUENCE IF NOT EXISTS refunds_id_seq;
SELECT setval('refunds_id_seq', COALESCE((SELECT MAX(id) FROM refunds), 0) + 1);
ALTER TABLE refunds ALTER COLUMN id SET DEFAULT nextval('refunds_id_seq');
ALTER SEQUENCE refunds_id_seq OWNED BY refunds.id;

-- Similarly for refund backfill
CREATE OR REPLACE FUNCTION public.backfill_refund(
  p_invoice_id   integer,
  p_amount       bigint,
  p_reason       text,
  p_tx_id        text,
  p_block_height integer,
  p_token_type   text DEFAULT 'sbtc'
)
RETURNS text  -- 'inserted', 'duplicate', or 'denied'
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merchant   text;
  v_caller     text;
  v_exists     boolean;
  v_payer      text;
BEGIN
  -- 1. Verify the invoice exists and get its merchant + payer
  SELECT merchant_principal, COALESCE(payer, '') INTO v_merchant, v_payer
    FROM invoices
   WHERE id = p_invoice_id;

  IF v_merchant IS NULL THEN
    RETURN 'denied';
  END IF;

  -- 2. Verify the caller is the merchant
  v_caller := public.requesting_wallet_address();
  IF v_caller IS NULL OR v_caller <> v_merchant THEN
    RETURN 'denied';
  END IF;

  -- 3. Dedup: skip if a refund with this tx_id already exists
  IF p_tx_id IS NOT NULL AND p_tx_id <> '' THEN
    SELECT EXISTS(
      SELECT 1 FROM refunds WHERE tx_id = p_tx_id
    ) INTO v_exists;

    IF v_exists THEN
      RETURN 'duplicate';
    END IF;
  END IF;

  -- 4. Insert (id auto-generated, customer from invoice payer, processed_at_block from p_block_height)
  INSERT INTO refunds (
    invoice_id, merchant_principal, customer, amount, reason,
    processed_at_block, tx_id, token_type
  ) VALUES (
    p_invoice_id, v_merchant, v_payer, p_amount,
    COALESCE(p_reason, ''), p_block_height, NULLIF(p_tx_id, ''), p_token_type
  );

  RETURN 'inserted';
END;
$$;

-- Restrict execution to authenticated/anon roles (not public)
REVOKE ALL ON FUNCTION public.backfill_payment FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_payment TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.backfill_refund FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_refund TO anon, authenticated, service_role;
