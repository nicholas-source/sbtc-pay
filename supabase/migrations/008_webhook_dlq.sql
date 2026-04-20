-- Dead-letter queue for chainhook webhook events that failed processing.
-- Failed events are stored here for manual replay via GET /chainhook-webhook.

CREATE TABLE IF NOT EXISTS public.webhook_dlq (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_type  text        NOT NULL,
  tx_id       text        NOT NULL,
  block_height bigint     NOT NULL DEFAULT 0,
  payload     jsonb       NOT NULL DEFAULT '{}',
  error_message text      NOT NULL DEFAULT '',
  attempts    int         NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_attempted_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- Fast lookup for unresolved events (used by DLQ replay)
CREATE INDEX IF NOT EXISTS idx_webhook_dlq_unresolved
  ON public.webhook_dlq (created_at)
  WHERE resolved_at IS NULL;

-- Deduplication: prevent inserting the same failed event twice
CREATE INDEX IF NOT EXISTS idx_webhook_dlq_tx_event
  ON public.webhook_dlq (tx_id, event_type)
  WHERE resolved_at IS NULL;

-- RLS: service_role only (webhook uses service_role key)
ALTER TABLE public.webhook_dlq ENABLE ROW LEVEL SECURITY;

-- No RLS policies = only service_role can access (bypasses RLS)
COMMENT ON TABLE public.webhook_dlq IS 'Dead-letter queue for chainhook webhook events that failed processing';
