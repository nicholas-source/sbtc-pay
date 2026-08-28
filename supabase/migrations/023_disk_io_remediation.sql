-- Disk IO remediation — Supabase flagged sbtc-pay-mainnet for Disk IO Budget
-- depletion on 2026-08-24.
--
-- Root cause was three unbounded relations churning against a 224 MB
-- shared_buffers on a 495 MB database:
--
--   cron.job_run_details   198 MB / 406,581 rows  (pg_cron never prunes it)
--   net._http_response     192 MB /     522 rows  (~99% dead tuples, unvacuumed)
--   public.events           64 MB / 177,405 rows  (158,926 of them heartbeats)
--
-- The working set could not fit in cache, so ordinary reads became disk reads.
--
-- The dominant single query was the indexer-heartbeat cron (migration 016).
-- Its block_height subquery —
--     COALESCE((SELECT MAX(block_height) FROM public.events
--               WHERE event_type != 'heartbeat'), 0)
-- — had no usable index, so it sequentially scanned the whole events heap once
-- a minute. pg_stat_statements: 158,847 calls, 435 ms mean, 19.2 hours of
-- cumulative execution, 2.46 TB of buffer traffic, 13.5 billion tuples read.
--
-- That value is written to a column nothing reads. IndexerHealthPanel switched
-- to a time-based aliveness signal (processed_at of the newest heartbeat) and
-- takes its "last indexed block" from the newest *non*-heartbeat event. The
-- scan fed a dead field, and each heartbeat row it inserted made the next scan
-- more expensive — the cost grew with its own output.
--
-- This migration keeps the heartbeat's behaviour identical and makes it O(1).

------------------------------------------------------------------------
-- 1. Index consolidation on public.events
------------------------------------------------------------------------

-- Redundant: a left-prefix of events_tx_id_event_type_unique (tx_id, event_type).
-- 10 MB, 0 scans since stats were last reset, maintained on every insert.
DROP INDEX IF EXISTS public.idx_events_tx;

-- Superseded by idx_events_type_processed below, which has event_type as its
-- leading column and additionally satisfies the ORDER BY.
DROP INDEX IF EXISTS public.idx_events_type;

-- Serves IndexerHealthPanel's aliveness probe:
--   .eq("event_type","heartbeat").order("processed_at", desc).limit(1)
-- as a one-row index lookup instead of "read every heartbeat row, then sort".
CREATE INDEX IF NOT EXISTS idx_events_type_processed
  ON public.events (event_type, processed_at DESC);

-- Serves the heartbeat cron's MAX(block_height) subquery, and the panel's
-- "last indexed block" query, as a single-row backward index scan. Partial, so
-- it indexes only the ~18k real events and never grows with heartbeat volume.
CREATE INDEX IF NOT EXISTS idx_events_real_block
  ON public.events (block_height DESC)
  WHERE event_type <> 'heartbeat';

------------------------------------------------------------------------
-- 2. Heartbeat retention
------------------------------------------------------------------------
-- Only the single newest heartbeat is ever read, by one admin panel. Retaining
-- 24h leaves ample forensic history at a fixed ~1,440-row ceiling instead of
-- the unbounded +1,440/day growth that produced 158,926 rows.
--
-- The one-time backlog delete below is a single statement: events is a 35 MB
-- heap, so ~157k dead tuples is well within what one autovacuum pass reclaims.
-- The space is returned to the heap's free space map for reuse, not to the OS;
-- see the VACUUM FULL note at the end of this file for the actual shrink.
DELETE FROM public.events
WHERE event_type = 'heartbeat'
  AND processed_at < now() - interval '24 hours';

SELECT cron.unschedule('prune-heartbeats')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-heartbeats');

-- Hourly, not per-minute: a 1,440-row table does not need minute-grain pruning,
-- and a separate job keeps delete churn off the heartbeat's own hot path.
SELECT cron.schedule(
  'prune-heartbeats',
  '7 * * * *',
  $$
  DELETE FROM public.events
  WHERE event_type = 'heartbeat'
    AND processed_at < now() - interval '24 hours';
  $$
);

------------------------------------------------------------------------
-- 3. Rewrite the heartbeat cron (supersedes migration 016)
------------------------------------------------------------------------
-- Identical semantics and identical row shape. The subquery is unchanged in
-- meaning but now resolves via idx_events_real_block, so it reads one index
-- tuple rather than scanning the heap.
SELECT cron.unschedule('indexer-heartbeat')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'indexer-heartbeat');

SELECT cron.schedule(
  'indexer-heartbeat',
  '* * * * *',
  $$
  INSERT INTO public.events (event_type, tx_id, block_height, block_hash, contract_identifier, payload)
  SELECT
    'heartbeat',
    'heartbeat-' || extract(epoch from now())::bigint::text,
    COALESCE((SELECT block_height FROM public.events
              WHERE event_type <> 'heartbeat'
              ORDER BY block_height DESC
              LIMIT 1), 0),
    '0x',
    'system',
    jsonb_build_object('source','pg_cron','at',now())
  ON CONFLICT (tx_id, event_type) DO NOTHING;
  $$
);

------------------------------------------------------------------------
-- 4. pg_cron run-history retention
------------------------------------------------------------------------
-- pg_cron appends to cron.job_run_details forever and never prunes. At the
-- current 5 scheduled jobs (~3,800 runs/day) it had reached 406,581 rows /
-- 198 MB, and each run rewrites its row four times as it transitions state —
-- so this table was also a steady source of dirty pages, not just dead space.
-- 7 days keeps roughly 27k rows, enough to debug a failing job over a weekend.
SELECT cron.unschedule('prune-cron-history')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-cron-history');

SELECT cron.schedule(
  'prune-cron-history',
  '13 * * * *',
  $$
  DELETE FROM cron.job_run_details
  WHERE end_time < now() - interval '7 days';
  $$
);

------------------------------------------------------------------------
-- 5. Autovacuum tuning for the high-churn relations
------------------------------------------------------------------------
-- public.events had not been autovacuumed since 2026-08-09 because the default
-- 20% threshold scales with table size — on a table inflated by heartbeats the
-- trigger point kept receding. A flat scale_factor with a small absolute
-- threshold makes vacuuming track write volume rather than row count.
ALTER TABLE public.events SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_vacuum_threshold    = 1000,
  autovacuum_analyze_scale_factor = 0.02,
  autovacuum_analyze_threshold   = 1000
);

-- cron.job_run_details also showed last_autovacuum = NULL across 406k rows, but
-- it is owned by supabase_admin and ALTER TABLE requires ownership, so it
-- cannot be tuned from a migration running as postgres. The hourly prune in
-- section 4 keeps it small enough that the default 20% threshold is adequate;
-- postgres does hold DELETE on the table, which is all the prune needs.

------------------------------------------------------------------------
-- 6. Space reclamation — RUN SEPARATELY, NOT PART OF THIS MIGRATION
------------------------------------------------------------------------
-- The sections above stop the growth but do not shrink files already on disk.
-- Only VACUUM FULL returns space to the OS, and it cannot run inside a
-- transaction block, so it cannot live in a migration.
--
-- Ownership determines what is possible here, and it differs per table:
--
--   public.events           owned by postgres       -> VACUUM FULL works
--   net._http_response      owned by supabase_admin -> VACUUM FULL is SKIPPED
--   cron.job_run_details    owned by supabase_admin -> VACUUM FULL is SKIPPED
--
-- VACUUM silently skips relations the caller does not own (it emits a warning,
-- not an error), so a VACUUM FULL over the latter two appears to succeed while
-- reclaiming nothing. Migrations and the Supabase SQL editor both run as
-- postgres, so there is no route to VACUUM FULL them from here.
--
-- postgres does hold TRUNCATE on both, and TRUNCATE rewrites to a fresh empty
-- file, which reclaims the space immediately. That is the only reclamation
-- path available for them, at the cost of discarding their current contents:
--
--   TRUNCATE net._http_response;
--     Holds pg_net responses awaiting collection via net.http_collect_response.
--     Every net.http_post in this project is fire-and-forget from a cron job
--     and no caller ever collects, so the rows are already garbage that pg_net's
--     own TTL sweep would delete. Discarding them loses nothing.
--
--   TRUNCATE cron.job_run_details;
--     Pure pg_cron execution history. Nothing in the application reads it —
--     IndexerHealthPanel derives cron aliveness from public.events, not from
--     here. Discarding it loses retrospective debugging of past cron runs, and
--     the section 4 prune then holds it at a 7-day rolling window.
--
-- Applied to mainnet and testnet on 2026-08-28:
--
--   VACUUM (FULL, ANALYZE) public.events;
--   TRUNCATE net._http_response;
--   TRUNCATE cron.job_run_details;
--
-- Measured result:
--
--                        mainnet          testnet
--   public.events        64 MB -> 11 MB   79 MB -> 9 MB
--   net._http_response  192 MB ->  0      182 MB -> 0
--   cron.job_run_details 198 MB ->  0     203 MB -> 0
--   database total      495 MB -> 38 MB  505 MB -> 38 MB
--
-- Both databases now sit well inside the 224 MB shared_buffers, so the whole
-- working set is cache-resident and steady-state disk reads approach zero.
--
-- Heartbeat subquery, before and after (EXPLAIN ANALYZE, mainnet):
--   before  Seq Scan, 4441 buffers, 158,929 rows discarded to find 18,481
--   after   Index Only Scan on idx_events_real_block, 4 buffers
-- End-to-end pg_cron run time for indexer-heartbeat: 435 ms mean -> 9 ms.
