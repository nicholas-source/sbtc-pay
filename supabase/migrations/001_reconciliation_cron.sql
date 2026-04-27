-- Enable required extensions (pg_cron is available on Supabase Pro+, pg_net on all plans)
-- Run this in the Supabase SQL Editor.

-- pg_net lets us make HTTP requests from inside Postgres
create extension if not exists pg_net with schema extensions;
-- pg_cron lets us schedule recurring jobs
-- NOTE: pg_cron requires Supabase Pro plan. If on free tier, use an external
-- scheduler (Vercel Cron, GitHub Actions, or a simple curl cron) instead.
-- The Edge Function accepts GET requests for cron-friendliness.
create extension if not exists pg_cron with schema extensions;
-- Schedule reconciliation every 5 minutes
-- The Edge Function URL format: <SUPABASE_URL>/functions/v1/reconcile
-- Replace <YOUR_SUPABASE_URL> and <YOUR_SERVICE_ROLE_KEY> below.
select cron.schedule(
  'reconcile-chain-state',   -- job name
  '*/5 * * * *',             -- every 5 minutes
  $$
  select net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/reconcile',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  );
  $$
);
-- If app.settings aren't configured, use this hardcoded version instead
-- (uncomment and fill in your values):
--
-- select cron.schedule(
--   'reconcile-chain-state',
--   '*/5 * * * *',
--   $$
--   select net.http_post(
--     url := 'https://oggvlwdptcpwipxahhjn.supabase.co/functions/v1/reconcile',
--     headers := '{"Authorization": "Bearer <YOUR_SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
--     body := '{}'::jsonb
--   );
--   $$
-- );

-- To check scheduled jobs:
-- select * from cron.job;

-- To see job run history:
-- select * from cron.job_run_details order by start_time desc limit 20;

-- To remove the job:
-- select cron.unschedule('reconcile-chain-state');;
