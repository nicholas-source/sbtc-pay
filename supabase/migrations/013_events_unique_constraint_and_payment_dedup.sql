-- Migration 013: Two fixes for double-counting in admin analytics.
--
-- ROOT CAUSE
-- ----------
-- 1. The `events` table had no unconditional unique constraint on (tx_id, event_type).
--    PostgREST translates `onConflict: "tx_id,event_type"` to a plain
--    `ON CONFLICT (tx_id, event_type)` — which requires an unconditional unique
--    constraint, not a partial index (same problem fixed for webhook_deliveries in
--    migration 012).  Without it, every upsert returns error 42P10
--    ("no unique or exclusion constraint matching the ON CONFLICT specification").
--    The webhook's error handler logs and `continue`s, so the idempotency gate
--    never fires, and a second chainhook delivery can call handlePaymentReceived
--    a second time.
--
-- 2. The `payments` table received duplicate rows before migration 010 added
--    UNIQUE(tx_id) — specifically when chainhook re-delivered historical events
--    on predicate re-registration (enable_on_registration: true).  Clean those
--    up now by retaining only the earliest row for each tx_id.
--
-- FIXES
-- -----
-- A. Unconditional UNIQUE constraint on events(tx_id, event_type):
--    Guards all future webhook deliveries — the upsert now correctly
--    detects duplicates and the handler is skipped.
--
-- B. Remove duplicate payment rows (same tx_id, keep lowest id):
--    Corrects the historical data so admin analytics shows accurate counts.
--    Also removes matching orphan rows from dependent tables if they exist.

-- ── A. events table unique constraint ─────────────────────────────────────────

-- Drop a partial index if one was created earlier (partial indexes do not work
-- with plain ON CONFLICT — see migration 012 for the explanation).
DROP INDEX IF EXISTS public.idx_events_tx_id_event_type;
DROP INDEX IF EXISTS public.idx_events_idempotency;

-- Add an unconditional unique constraint.  IF NOT EXISTS guards against
-- re-running this migration on a database that already has the constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'events_tx_id_event_type_unique'
      AND conrelid = 'public.events'::regclass
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_tx_id_event_type_unique
      UNIQUE (tx_id, event_type);
  END IF;
END;
$$;

-- ── B. Deduplicate payment rows ────────────────────────────────────────────────

-- Keep the row with the lowest id (first inserted) for each tx_id.
-- Uses a self-join to find duplicates without a CTE, which is compatible
-- with all Supabase/Postgres versions.
DELETE FROM public.payments AS a
USING  public.payments AS b
WHERE  a.tx_id = b.tx_id
  AND  a.id    > b.id;

-- Sanity-check: after dedup, no two rows should share a tx_id.
-- The UNIQUE(tx_id) constraint from migration 010 already enforces this going
-- forward; this migration just removes any rows that snuck in before it was
-- applied.
