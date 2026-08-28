-- Reconcile RLS policies to a single generation.
--
-- A schema comparison of the two projects found them meaningfully divergent:
-- mainnet carries 26 policies, testnet 54. Testnet is a strict superset — every
-- mainnet policy is present there (0 missing) plus 28 extras. The extras are an
-- older generation that migrations 004/005/009 replaced; on mainnet the
-- originals were dropped, on testnet they were left in place alongside the new
-- ones, so both naming conventions coexist ("Merchant can read own payments"
-- next to "Merchants read own payments").
--
-- They are identifiable as the older generation by two markers:
--   * they call requesting_wallet(), not requesting_wallet_address()
--   * their admin checks hardcode the testnet deployer principal
--     'STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR' rather than going through
--     is_platform_admin(), which resolves against platform_config.contract_owner
--
-- Two of the 28 are worth calling out specifically:
--
--   events_read_all                  USING (true)
--       Public, unauthenticated read of the entire event log. Mainnet's
--       equivalent ("Authenticated users read events") requires a JWT. This is
--       a real exposure on testnet, and the single best reason to run this.
--
--   "Anyone can read active merchants"  USING (is_active = true)
--       A public merchant directory that mainnet does not have.
--
-- Because RLS policies are permissive and OR'd together, these extras only ever
-- widen access. Dropping them therefore REDUCES what testnet exposes, bringing
-- it in line with mainnet. That is the intent — mainnet is production truth —
-- but it is a behavioural change on testnet, not a cleanup with no effect.
--
-- Access removed that has no mainnet equivalent at all:
--   direct_payments — "Payer can read own direct payments". Mainnet grants
--   direct_payments reads to admins and merchants only, never to the payer.
-- Everything else being dropped is covered by a mainnet policy that is equal or
-- broader (e.g. "Public read payments" subsumes "Payer can read own payments").
--
-- Safe to run against either project: every statement is DROP POLICY IF EXISTS,
-- so on mainnet this is a no-op. It is written this way deliberately, so the
-- migration history stays identical across environments.
--
-- NOT addressed here: the two projects also differ in column types (mainnet
-- uses integer where testnet uses bigint across ~24 id/block-height columns,
-- and integer vs smallint for status). Correcting that is a table rewrite for
-- no current benefit — burn heights are ~8.6M against an int4 ceiling of 2.1B —
-- so it is documented and left alone.

DROP POLICY IF EXISTS "Admin can read all direct_payments" ON public.direct_payments;
DROP POLICY IF EXISTS "Merchant can read own direct payments" ON public.direct_payments;
DROP POLICY IF EXISTS "Payer can read own direct payments" ON public.direct_payments;
DROP POLICY IF EXISTS events_read_all ON public.events;
DROP POLICY IF EXISTS "Anyone can read pending invoices by id for payment" ON public.invoices;
DROP POLICY IF EXISTS "Contract deployer can read all invoices" ON public.invoices;
DROP POLICY IF EXISTS "Merchant can insert own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Merchant can read own invoices" ON public.invoices;
DROP POLICY IF EXISTS "Payer can read invoices they paid" ON public.invoices;
DROP POLICY IF EXISTS "Admin can read all merchants" ON public.merchants;
DROP POLICY IF EXISTS "Anyone can read active merchants" ON public.merchants;
DROP POLICY IF EXISTS "Merchant can insert own record" ON public.merchants;
DROP POLICY IF EXISTS "Merchant can read own record even if inactive" ON public.merchants;
DROP POLICY IF EXISTS "Merchant can update own record" ON public.merchants;
DROP POLICY IF EXISTS "Admin can read all payments" ON public.payments;
DROP POLICY IF EXISTS "Merchant can read own payments" ON public.payments;
DROP POLICY IF EXISTS "Payer can read own payments" ON public.payments;
DROP POLICY IF EXISTS "Anyone can read platform stats" ON public.platform_stats;
DROP POLICY IF EXISTS "Admin can read all refunds" ON public.refunds;
DROP POLICY IF EXISTS "Anyone can read refunds for visible invoices" ON public.refunds;
DROP POLICY IF EXISTS "Customer can read own refunds" ON public.refunds;
DROP POLICY IF EXISTS "Merchant can read own refunds" ON public.refunds;
DROP POLICY IF EXISTS "Admin can read all subscription_payments" ON public.subscription_payments;
DROP POLICY IF EXISTS "Merchant can read own sub payments" ON public.subscription_payments;
DROP POLICY IF EXISTS "Subscriber can read own sub payments" ON public.subscription_payments;
DROP POLICY IF EXISTS "Admin can read all subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Merchant can read own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Subscriber can read own subscriptions" ON public.subscriptions;
