-- Schedule cron to drain pending webhook retries every minute.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('merchant-webhook-retry')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'merchant-webhook-retry');

SELECT cron.schedule(
  'merchant-webhook-retry',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oggvlwdptcpwipxahhjn.supabase.co/functions/v1/merchant-webhook-sender?mode=retry',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
