-- Enable Supabase Realtime on payment-related tables.
-- Before this migration, PaymentPage's postgres_changes subscription on
-- "payments" silently produced no events because the table wasn't in the
-- publication; polling saved the UX but delayed the "payment landed" moment.
-- Adding direct_payments + subscription_payments lets the merchant
-- dashboard surface payments live as chainhook indexes them.
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_payments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.subscription_payments;
