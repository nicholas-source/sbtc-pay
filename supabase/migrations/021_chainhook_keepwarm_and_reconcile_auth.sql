-- Two infra fixes that surfaced together when the mainnet chainhook timed
-- out and disabled itself on 2026-06-24.
--
-- 1. chainhook-webhook keep-warm.
--    Mainnet contract events are sparse during quiet periods. When no event
--    fires for ~15+ minutes the edge function goes cold; the next delivery
--    from Hiro then has to cold-start (Deno boot + esm.sh imports for
--    @supabase/supabase-js and @stacks/transactions@7), which can exceed
--    Hiro's headers-timeout. Hiro retries, fails, then disables the
--    chainhook. The keep-warm cron pings the function every 4 minutes with
--    no auth so the GET handler returns 401 quickly — cheap, no data
--    side-effects, container stays warm.
--
-- 2. reconcile-chain-state cron auth.
--    The cron job was created sending
--      'Bearer ' || current_setting('supabase.service_role_key', true)
--    but that GUC was never populated on either env, so it sent
--    'Bearer ' (empty token) every 5 minutes and the reconcile function
--    rejected every call as 401. The reconciliation safety net hasn't
--    actually been running since deployment.
--
-- Both fixes read their per-env config from Supabase Vault, so this single
-- migration file works on testnet and mainnet without modification. The
-- only per-env divergence is the one-time vault setup documented below.
--
-- ---------------------------------------------------------------
-- PER-ENV ONE-TIME SETUP (run once per project, BEFORE this migration)
-- ---------------------------------------------------------------
--
-- (a) Store the project URL in vault:
--
--       SELECT vault.create_secret(
--         'https://<PROJECT_REF>.supabase.co',
--         'project_url',
--         'Self-referential project URL used by pg_cron'
--       );
--
--     Mainnet ref: kkkvlbdcgupesyzmmpqv (already populated 2026-06-24).
--     Testnet ref: oggvlwdptcpwipxahhjn (pending).
--
-- (b) Generate a random 64-char shared secret per env (do NOT reuse mainnet's
--     value on testnet):
--
--       SELECT encode(gen_random_bytes(32), 'hex');
--
-- (c) Set the generated value as RECONCILE_SECRET in the env's Edge Function
--     Secrets (Dashboard -> Edge Functions -> Secrets -> Add Secret).
--
-- (d) Store the same value in vault under name 'service_role_key' (legacy
--     name kept for cron-command continuity):
--
--       SELECT vault.create_secret(
--         '<paste-value>',
--         'service_role_key',
--         'Shared with RECONCILE_SECRET on the reconcile edge function'
--       );
--
-- Mainnet steps a/c/d completed 2026-06-24. Testnet pending.
--
-- If either vault entry is missing when this migration runs, the relevant
-- DO block aborts with a clear error so you can do the setup and re-run.

-- ---------------------------------------------------------------
-- Helper: read a vault secret by name, raising if missing.
-- ---------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.vault_get(p_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_value text;
BEGIN
  SELECT decrypted_secret INTO v_value
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;
  IF v_value IS NULL OR v_value = '' THEN
    RAISE EXCEPTION 'vault secret % is not set (see migration 021 header for per-env setup)', p_name;
  END IF;
  RETURN v_value;
END;
$$;

-- Only service_role + postgres should be able to read vault. Lock down execute.
REVOKE EXECUTE ON FUNCTION public.vault_get(text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------
-- 1. chainhook-webhook keep-warm cron (idempotent)
-- ---------------------------------------------------------------

DO $$
DECLARE
  v_url text := public.vault_get('project_url');
BEGIN
  PERFORM cron.unschedule('chainhook-webhook-keepwarm')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'chainhook-webhook-keepwarm');

  PERFORM cron.schedule(
    'chainhook-webhook-keepwarm',
    '*/4 * * * *',
    format(
      $cmd$
      SELECT net.http_get(
        url := %L,
        timeout_milliseconds := 5000
      );
      $cmd$,
      v_url || '/functions/v1/chainhook-webhook'
    )
  );
END $$;

-- ---------------------------------------------------------------
-- 2. reconcile-chain-state cron: read auth from vault instead of the
--    never-populated supabase.service_role_key GUC.
-- ---------------------------------------------------------------

DO $$
DECLARE
  v_url text := public.vault_get('project_url');
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'reconcile-chain-state';
  IF v_jobid IS NULL THEN
    RAISE NOTICE 'reconcile-chain-state cron job not found; skipping ALTER (run the original create-reconcile-cron migration first)';
    RETURN;
  END IF;

  PERFORM cron.alter_job(
    job_id := v_jobid,
    command := format(
      $cmd$
      SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || public.vault_get('service_role_key'),
          'Content-Type', 'application/json'
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
      $cmd$,
      v_url || '/functions/v1/reconcile'
    )
  );
END $$;
