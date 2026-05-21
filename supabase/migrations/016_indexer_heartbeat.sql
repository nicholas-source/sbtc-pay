-- Indexer heartbeat — confirms the DB layer is alive even when no chain
-- events fire. Without this, IndexerHealthPanel falsely flags "behind"
-- during quiet periods (no merchants registering, no payments).
--
-- Strategy: insert a synthetic event_type='heartbeat' row every minute,
-- using the latest real event's block_height so the lag calculation
-- (stacksTip - heartbeat.block_height) keeps reporting indexer lag rather
-- than the heartbeat's pretend block.

CREATE EXTENSION IF NOT EXISTS pg_cron;

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
    COALESCE((SELECT MAX(block_height) FROM public.events WHERE event_type != 'heartbeat'), 0),
    '0x',
    'system',
    jsonb_build_object('source','pg_cron','at',now())
  ON CONFLICT (tx_id, event_type) DO NOTHING;
  $$
);
