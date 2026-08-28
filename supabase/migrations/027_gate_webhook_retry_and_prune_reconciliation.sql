-- Make two recurring jobs cost something only when there is work to do.
--
-- Context: this platform has recorded 78 real business events in its lifetime
-- (May 9 - Jul 23) while writing ~1,728 bookkeeping rows and ~2,088 outbound
-- HTTP calls per day. Migration 023 addressed the heartbeat half of that. This
-- addresses the other two contributors, both of which run at full cost at zero
-- traffic.

------------------------------------------------------------------------
-- 1. Gate merchant-webhook-retry on there actually being a retry
------------------------------------------------------------------------
-- The job (migration 015) POSTs to merchant-webhook-sender?mode=retry every
-- minute unconditionally. The sender then selects
--     status = 'pending' AND next_attempt_at <= now()
-- and, on mainnet today, finds nothing: webhook_deliveries holds 12 delivered
-- and 4 dead rows, and zero pending. So ~1,440 HTTP round trips a day, each
-- writing a net._http_response row, to discover there is no work — which is a
-- large share of the pg_net churn that 023 had to truncate.
--
-- Same predicate, evaluated in SQL first. When nothing is due, the job does one
-- cheap index-less lookup on a 16-row table and stops.
--
-- The URL is read from the job's existing definition rather than written in:
-- mainnet and testnet point at different project refs, and the repo's copies of
-- 015/021 carry the testnet URL, so hardcoding here would silently repoint one
-- environment at the other.
DO $$
DECLARE
  v_url text;
BEGIN
  SELECT (regexp_match(command, 'url\s*:=\s*''([^'']+)'''))[1]
    INTO v_url
  FROM cron.job
  WHERE jobname = 'merchant-webhook-retry';

  IF v_url IS NULL THEN
    RAISE EXCEPTION 'merchant-webhook-retry job or its url not found; refusing to guess a URL';
  END IF;

  PERFORM cron.unschedule('merchant-webhook-retry');

  PERFORM cron.schedule(
    'merchant-webhook-retry',
    '* * * * *',
    format($job$
      DO $inner$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM public.webhook_deliveries
          WHERE status = 'pending' AND next_attempt_at <= now()
        ) THEN
          PERFORM net.http_post(
            url := %L,
            headers := '{"Content-Type": "application/json"}'::jsonb,
            body := '{}'::jsonb,
            timeout_milliseconds := 30000
          );
        END IF;
      END
      $inner$;
    $job$, v_url)
  );
END $$;

------------------------------------------------------------------------
-- 2. Retention for reconciliation events
------------------------------------------------------------------------
-- 023 capped heartbeats but left this: the reconcile cron writes one
-- event_type='reconciliation' row every 5 minutes whether or not it corrected
-- anything, which is 288/day and ~105k/year, unbounded. At the time of writing
-- these are 18,411 of the 18,481 non-heartbeat rows in the table — 99.6% of the
-- "real" event log is this job's own bookkeeping.
--
-- 30 days is well beyond any consumer: IndexerHealthPanel reads reconciliation
-- rows only for the last 24h, to compute its drift count.
--
-- The deeper fix is for reconcile to write an event only when it actually
-- corrected something, plus a periodic liveness marker. That lives in the
-- reconcile edge function, not here, so this is retention only.
SELECT cron.unschedule('prune-reconciliation-events')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'prune-reconciliation-events');

SELECT cron.schedule(
  'prune-reconciliation-events',
  '23 * * * *',
  $$
  DELETE FROM public.events
  WHERE event_type = 'reconciliation'
    AND processed_at < now() - interval '30 days';
  $$
);
