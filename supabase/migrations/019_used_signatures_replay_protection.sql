-- Replay-protection nonce store for wallet-auth.
-- The edge function records the SHA-256 hash of every accepted signature so
-- the same (message, signature) pair can't be reused within the 5-minute
-- message-freshness window.
--
-- This table is internal to the wallet-auth edge function and must NEVER be
-- exposed to the Data API. RLS is enabled with zero policies, so even the
-- anon/authenticated roles see nothing; only service_role (which bypasses RLS)
-- can read/write. No explicit grants to anon/authenticated — they should not
-- have access.

CREATE TABLE IF NOT EXISTS public.used_signatures (
  signature_hash text PRIMARY KEY,
  used_at        timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_used_signatures_expires_at
  ON public.used_signatures (expires_at);

ALTER TABLE public.used_signatures ENABLE ROW LEVEL SECURITY;
-- Intentionally no policies — service_role bypasses RLS.

-- Service-role only; no anon/authenticated grants.
GRANT SELECT, INSERT, DELETE ON public.used_signatures TO service_role;

-- Cleanup: drop expired rows every 5 minutes.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule('cleanup-used-signatures')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-used-signatures');

SELECT cron.schedule(
  'cleanup-used-signatures',
  '*/5 * * * *',
  $$ DELETE FROM public.used_signatures WHERE expires_at < now(); $$
);
