-- Migration: Add STX token support alongside sBTC
-- Adds token_type column to all relevant tables and per-token stats

-- 1. Add token_type to invoices (default 'sbtc' for existing rows)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'sbtc';
-- 2. Add token_type to payments
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'sbtc';
-- 3. Add token_type to direct_payments
ALTER TABLE direct_payments
  ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'sbtc';
-- 4. Add token_type to subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'sbtc';
-- 5. Add token_type to subscription_payments
ALTER TABLE subscription_payments
  ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'sbtc';
-- 6. Add token_type to refunds
ALTER TABLE refunds
  ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'sbtc';
-- 7. Add per-token stats to merchants
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS total_received_sbtc BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_refunded_sbtc BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_received_stx BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_refunded_stx BIGINT NOT NULL DEFAULT 0;
-- Migrate existing total_received/total_refunded into sbtc columns (idempotent)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'merchants' AND column_name = 'total_received') THEN
    UPDATE merchants
      SET total_received_sbtc = COALESCE(total_received, 0),
          total_refunded_sbtc = COALESCE(total_refunded, 0)
      WHERE total_received_sbtc = 0;
  END IF;
END $$;
-- 8. Add per-token volume stats to platform_stats
ALTER TABLE platform_stats
  ADD COLUMN IF NOT EXISTS total_volume_sbtc BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_fees_sbtc BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_refunds_sbtc BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_volume_stx BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_fees_stx BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_refunds_stx BIGINT NOT NULL DEFAULT 0;
-- Migrate existing stats into sbtc columns (idempotent)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'platform_stats' AND column_name = 'total_fees') THEN
    UPDATE platform_stats
      SET total_volume_sbtc = COALESCE(total_volume, 0),
          total_fees_sbtc = COALESCE(total_fees, 0),
          total_refunds_sbtc = COALESCE(total_refunds, 0)
      WHERE total_volume_sbtc = 0;
  END IF;
END $$;
-- 9. Add token_type to events table
ALTER TABLE events
  ADD COLUMN IF NOT EXISTS token_type TEXT;
-- 10. Add CHECK constraint to validate token_type values (idempotent)
DO $$ BEGIN
  ALTER TABLE invoices ADD CONSTRAINT chk_invoices_token_type CHECK (token_type IN ('sbtc', 'stx'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE payments ADD CONSTRAINT chk_payments_token_type CHECK (token_type IN ('sbtc', 'stx'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE direct_payments ADD CONSTRAINT chk_direct_payments_token_type CHECK (token_type IN ('sbtc', 'stx'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE subscriptions ADD CONSTRAINT chk_subscriptions_token_type CHECK (token_type IN ('sbtc', 'stx'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE subscription_payments ADD CONSTRAINT chk_subscription_payments_token_type CHECK (token_type IN ('sbtc', 'stx'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE refunds ADD CONSTRAINT chk_refunds_token_type CHECK (token_type IN ('sbtc', 'stx'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
-- 11. Add index for filtering by token_type
CREATE INDEX IF NOT EXISTS idx_invoices_token_type ON invoices(token_type);
CREATE INDEX IF NOT EXISTS idx_payments_token_type ON payments(token_type);
CREATE INDEX IF NOT EXISTS idx_subscriptions_token_type ON subscriptions(token_type);
