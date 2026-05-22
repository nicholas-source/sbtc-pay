-- Enable Supabase Realtime on the merchants table.
-- Lets the admin panel push live updates when a new merchant registers
-- (instead of waiting for manual refresh or the 30s background poll).
-- Migration 017 already added payments, direct_payments, subscription_payments.
ALTER PUBLICATION supabase_realtime ADD TABLE public.merchants;
