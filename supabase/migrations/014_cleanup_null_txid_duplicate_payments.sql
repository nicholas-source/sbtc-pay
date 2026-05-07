-- Remove reconcile-inserted orphan payment rows (tx_id IS NULL) where a
-- chainhook-confirmed payment (tx_id IS NOT NULL) exists for the same invoice.
--
-- Root cause: the reconcile cron job inserts a "catch-up" payment row with
-- tx_id = NULL when it detects on-chain payments not yet reflected in the DB.
-- If the chainhook then fires (which it normally does within ~1-2 min) and
-- also inserts a payment row with the real tx_id, both rows survive because
-- the payments UNIQUE(tx_id) constraint allows multiple NULLs.
--
-- Safe to apply repeatedly — the WHERE clause only targets true orphans.
DELETE FROM public.payments
WHERE tx_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.payments real_row
    WHERE real_row.invoice_id = payments.invoice_id
      AND real_row.tx_id IS NOT NULL
  );
