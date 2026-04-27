-- Add UNIQUE(tx_id) on payment tables so DLQ replay is idempotent.
-- Without this, a handler that partially succeeds (row insert + RPC increment,
-- then the RPC fails) leaves the row behind; DLQ replay then inserts a second
-- row and double-counts stats. With the unique constraint + upsert-with-
-- ignoreDuplicates in the webhook, replay is a no-op on already-applied rows.

ALTER TABLE public.payments
  ADD CONSTRAINT payments_tx_id_key UNIQUE (tx_id);
ALTER TABLE public.direct_payments
  ADD CONSTRAINT direct_payments_tx_id_key UNIQUE (tx_id);
ALTER TABLE public.subscription_payments
  ADD CONSTRAINT subscription_payments_tx_id_key UNIQUE (tx_id);
