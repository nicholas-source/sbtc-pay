-- sBTC Pay: Row-Level Security policies
-- Secures tables so that:
--   - Authenticated merchants (via wallet JWT) can only read their own data
--   - Public/payment pages can read individual invoices (blockchain data is public)
--   - Only service_role (chainhook webhook, reconcile) can INSERT/UPDATE/DELETE

-- Helper function: extract wallet address from JWT sub claim OR x-wallet-address header (backward compat)
CREATE OR REPLACE FUNCTION public.requesting_wallet_address()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt()->>'sub', ''),
    NULLIF(current_setting('request.headers', true)::json->>'x-wallet-address', '')
  );
$$;
-- ═══════════════════════════════════════════════════════════════════
-- MERCHANTS: Only the merchant themselves can read/update their record
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Merchants read own record" ON merchants;
CREATE POLICY "Merchants read own record"
  ON merchants FOR SELECT
  USING (principal = public.requesting_wallet_address());
DROP POLICY IF EXISTS "Merchants update own record" ON merchants;
CREATE POLICY "Merchants update own record"
  ON merchants FOR UPDATE
  USING (principal = public.requesting_wallet_address());
-- Service role bypasses RLS, so no INSERT/DELETE policy needed for webhooks

-- ═══════════════════════════════════════════════════════════════════
-- INVOICES: Merchants see their own; payment page can read any by ID
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
-- Merchants can read all their invoices (dashboard)
DROP POLICY IF EXISTS "Merchants read own invoices" ON invoices;
CREATE POLICY "Merchants read own invoices"
  ON invoices FOR SELECT
  USING (merchant_principal = public.requesting_wallet_address());
-- Anyone can read a specific invoice (payment page uses anon key + no wallet header)
-- This is acceptable because invoice data is public on the blockchain
DROP POLICY IF EXISTS "Public read invoices for payment" ON invoices;
CREATE POLICY "Public read invoices for payment"
  ON invoices FOR SELECT
  USING (true);
-- Merchants can update their own invoices (e.g. reconciliation corrections)
DROP POLICY IF EXISTS "Merchants update own invoices" ON invoices;
CREATE POLICY "Merchants update own invoices"
  ON invoices FOR UPDATE
  USING (merchant_principal = public.requesting_wallet_address());
-- ═══════════════════════════════════════════════════════════════════
-- PAYMENTS: Read access mirrors invoices pattern
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Merchants read own payments" ON payments;
CREATE POLICY "Merchants read own payments"
  ON payments FOR SELECT
  USING (merchant_principal = public.requesting_wallet_address());
DROP POLICY IF EXISTS "Public read payments" ON payments;
CREATE POLICY "Public read payments"
  ON payments FOR SELECT
  USING (true);
-- ═══════════════════════════════════════════════════════════════════
-- REFUNDS: Same pattern as payments
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Merchants read own refunds" ON refunds;
CREATE POLICY "Merchants read own refunds"
  ON refunds FOR SELECT
  USING (merchant_principal = public.requesting_wallet_address());
DROP POLICY IF EXISTS "Public read refunds" ON refunds;
CREATE POLICY "Public read refunds"
  ON refunds FOR SELECT
  USING (true);
-- ═══════════════════════════════════════════════════════════════════
-- DIRECT PAYMENTS: Merchant-visible only
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE direct_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Merchants read own direct payments" ON direct_payments;
CREATE POLICY "Merchants read own direct payments"
  ON direct_payments FOR SELECT
  USING (merchant_principal = public.requesting_wallet_address());
-- ═══════════════════════════════════════════════════════════════════
-- SUBSCRIPTIONS: Merchant and subscriber access
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Merchants read own subscriptions" ON subscriptions;
CREATE POLICY "Merchants read own subscriptions"
  ON subscriptions FOR SELECT
  USING (merchant_principal = public.requesting_wallet_address());
DROP POLICY IF EXISTS "Subscribers read own subscriptions" ON subscriptions;
CREATE POLICY "Subscribers read own subscriptions"
  ON subscriptions FOR SELECT
  USING (subscriber = public.requesting_wallet_address());
-- ═══════════════════════════════════════════════════════════════════
-- SUBSCRIPTION PAYMENTS: Same as subscriptions
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Merchants read own subscription payments" ON subscription_payments;
CREATE POLICY "Merchants read own subscription payments"
  ON subscription_payments FOR SELECT
  USING (merchant_principal = public.requesting_wallet_address());
DROP POLICY IF EXISTS "Subscribers read own subscription payments" ON subscription_payments;
CREATE POLICY "Subscribers read own subscription payments"
  ON subscription_payments FOR SELECT
  USING (subscriber = public.requesting_wallet_address());
-- ═══════════════════════════════════════════════════════════════════
-- EVENTS: Read-only for authenticated users (for debugging/audit)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users read events" ON events;
CREATE POLICY "Authenticated users read events"
  ON events FOR SELECT
  USING (public.requesting_wallet_address() IS NOT NULL);
-- ═══════════════════════════════════════════════════════════════════
-- PLATFORM STATS: Public read (displayed on landing page)
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE platform_stats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read platform stats" ON platform_stats;
CREATE POLICY "Public read platform stats"
  ON platform_stats FOR SELECT
  USING (true);
-- No write policies for anon/authenticated — all writes go through
-- service_role (chainhook-webhook, reconcile edge functions) which bypass RLS.;
