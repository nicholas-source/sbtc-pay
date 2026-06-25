-- Allow platform admins to read webhook_dlq so the admin dashboard can
-- surface an "unresolved DLQ" pill — the "things went silently wrong"
-- signal you want visible at a glance, not buried in a query log.
--
-- Until now webhook_dlq had RLS enabled with no policies (migration 019),
-- so only service_role could read it. That's correct for keeping it out of
-- the public anon surface, but it also means the admin frontend can't query
-- it directly. This adds a single SELECT policy gated on is_platform_admin().
--
-- Writes stay locked to service_role (chainhook-webhook inserts on failure,
-- the DLQ-replay path updates on resolve). Admins are read-only.

CREATE POLICY "admins_can_read_webhook_dlq"
  ON public.webhook_dlq
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin());
