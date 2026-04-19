-- sBTC Pay: Admin RLS policies
-- Grants the contract owner read access to all tables for admin panel visibility.
-- The owner address is stored in platform_config (updated by webhook on ownership transfer).

-- ═══════════════════════════════════════════════════════════════════
-- Platform config table (stores contract owner for RLS checks)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS platform_config (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE platform_config ENABLE ROW LEVEL SECURITY;

-- Anyone can read config (owner address is not secret — it's on-chain)
CREATE POLICY "Public read platform config"
  ON platform_config FOR SELECT
  USING (true);

-- Only service_role can modify (webhook updates on ownership transfer)
-- No INSERT/UPDATE/DELETE policies needed — service_role bypasses RLS

-- ═══════════════════════════════════════════════════════════════════
-- Helper: check if the requesting wallet is the contract owner
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM platform_config
    WHERE key = 'contract_owner'
      AND value = public.requesting_wallet_address()
  );
$$;

-- ═══════════════════════════════════════════════════════════════════
-- Admin read policies: contract owner can read ALL rows
-- ═══════════════════════════════════════════════════════════════════

-- Merchants: admin reads all
CREATE POLICY "Admin read all merchants"
  ON merchants FOR SELECT
  USING (public.is_platform_admin());

-- Invoices: admin reads all
CREATE POLICY "Admin read all invoices"
  ON invoices FOR SELECT
  USING (public.is_platform_admin());

-- Payments: admin reads all
CREATE POLICY "Admin read all payments"
  ON payments FOR SELECT
  USING (public.is_platform_admin());

-- Refunds: admin reads all
CREATE POLICY "Admin read all refunds"
  ON refunds FOR SELECT
  USING (public.is_platform_admin());

-- Direct payments: admin reads all
CREATE POLICY "Admin read all direct payments"
  ON direct_payments FOR SELECT
  USING (public.is_platform_admin());

-- Subscriptions: admin reads all
CREATE POLICY "Admin read all subscriptions"
  ON subscriptions FOR SELECT
  USING (public.is_platform_admin());

-- Subscription payments: admin reads all
CREATE POLICY "Admin read all subscription payments"
  ON subscription_payments FOR SELECT
  USING (public.is_platform_admin());

-- ═══════════════════════════════════════════════════════════════════
-- Seed initial contract owner (update this after ownership transfers)
-- The chainhook webhook should call:
--   UPDATE platform_config SET value = '<new_owner>', updated_at = now()
--   WHERE key = 'contract_owner';
-- ═══════════════════════════════════════════════════════════════════
INSERT INTO platform_config (key, value)
VALUES ('contract_owner', 'STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
