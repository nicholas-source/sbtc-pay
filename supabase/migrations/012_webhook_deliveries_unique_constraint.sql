-- Replace the partial unique index from migration 011 with a real unique
-- constraint. PostgREST's `onConflict=col1,col2,col3` translates to a plain
-- ON CONFLICT (col1, col2, col3) — which only matches an unconditional
-- unique constraint, not a partial index. Without this, every real event
-- insert from chainhook fails with code 42P10 ("no unique or exclusion
-- constraint matching the ON CONFLICT specification").
--
-- Standard SQL NULL semantics: NULLs are treated as distinct in unique
-- constraints, so events with tx_id IS NULL won't collide with each other.
-- We also drop the WHERE clause; the constraint coverage is the same in
-- practice because every real on-chain event has a tx_id.

DROP INDEX IF EXISTS public.idx_webhook_deliveries_idempotency;

ALTER TABLE public.webhook_deliveries
  ADD CONSTRAINT webhook_deliveries_idempotency_key
  UNIQUE (merchant_principal, tx_id, event_type);
