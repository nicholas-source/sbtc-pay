-- Outbound merchant webhooks — delivery log and per-merchant signing secret.
-- When a contract event is indexed, chainhook-webhook enqueues a delivery that
-- the merchant-webhook-sender edge function fires (HMAC-signed POST).

-- Per-merchant HMAC secret for verifying outbound webhooks.
-- Stored as plaintext — Supabase handles encryption at rest. The secret is
-- shown to the merchant once (on generation) and cannot be retrieved later
-- via the UI; only rotated.
ALTER TABLE public.merchants
  ADD COLUMN IF NOT EXISTS webhook_secret text;

-- Delivery log: one row per attempt. Successful deliveries stay in the table
-- for auditability; failed deliveries are retried up to max_attempts.
CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id               bigserial PRIMARY KEY,
  merchant_id      text       NOT NULL,
  merchant_principal text     NOT NULL,
  webhook_url      text       NOT NULL,
  event_type       text       NOT NULL,
  tx_id            text,
  block_height     bigint,
  payload          jsonb      NOT NULL,
  status           text       NOT NULL DEFAULT 'pending',
    -- 'pending' | 'delivered' | 'failed' | 'dead'
  attempts         int        NOT NULL DEFAULT 0,
  last_status_code int,
  last_error       text,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_attempted_at timestamptz,
  delivered_at     timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_merchant
  ON public.webhook_deliveries (merchant_principal, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending
  ON public.webhook_deliveries (status, next_attempt_at)
  WHERE status = 'pending';

-- Unique (tx_id, event_type, merchant) to prevent duplicate deliveries if
-- chainhook replays events. Without this, DLQ replay would fire the merchant
-- webhook twice for the same on-chain event.
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_deliveries_idempotency
  ON public.webhook_deliveries (merchant_principal, tx_id, event_type)
  WHERE tx_id IS NOT NULL;

-- RLS: merchants can read their own delivery rows, nothing can write them
-- from the client — service-role functions handle all writes.
ALTER TABLE public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY webhook_deliveries_read_own
  ON public.webhook_deliveries
  FOR SELECT
  USING (merchant_principal = (current_setting('request.jwt.claims', true)::jsonb ->> 'sub'));
