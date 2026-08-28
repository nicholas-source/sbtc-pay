-- Make the GRANT layer agree with the RLS layer on every public table.
--
-- Supabase historically auto-granted every public table to anon/authenticated
-- (see _TEMPLATE.sql — this stops for existing projects on 2026-10-30). The
-- result is that all 13 tables carry:
--
--   DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
--
-- while the policy layer tells a completely different story: no table has an
-- INSERT or DELETE policy at all, and only invoices has an UPDATE policy
-- (merchants' was made inert by 024). RLS default-deny is what has actually
-- been holding the line — the grants have been decorative.
--
-- Relying on that is thinner than it looks, because RLS does not cover
-- everything a grant does. TRUNCATE in particular is NOT subject to row-level
-- security: a role holding it can empty a table no matter what the policies
-- say. REFERENCES and TRIGGER are likewise outside RLS.
--
-- Reachability was checked rather than assumed, and it is genuinely low:
--   * anon and authenticated are NOLOGIN; they are only ever assumed via
--     SET ROLE by the authenticator role.
--   * PostgREST emits only SELECT / INSERT / UPDATE / DELETE — there is no
--     HTTP path that reaches TRUNCATE, REFERENCES or TRIGGER.
--   * neither role holds CREATE on schema public.
-- So this migration is defence-in-depth, not an incident response. It removes
-- the gap between what the grants permit and what the policies intend, so a
-- future table that ships without the right policy fails closed on grants too.
--
-- BEHAVIOURAL NOTE, because "no behavioural change" would be inaccurate:
-- revoking a privilege that RLS already denies converts a silent no-op into an
-- explicit 42501. Two client call sites hit that, and both already handle it:
--   * subscription-store.ts:321 — subscriptions.update(), inside
--     Promise.all(...).catch(); subscriptions has no UPDATE policy, so this has
--     always affected zero rows. It will now return an error object instead.
--   * invoice-store.ts:913 — invoices.upsert(), guarded by
--     `if (error) console.error(...)`. Its INSERT path has never worked (no
--     INSERT policy on invoices), so the backfill safety net it implements was
--     already inoperative before this migration or 024.
-- Neither throws, neither is user-visible, and no 42501 appeared in the last
-- 24h of postgres logs.

------------------------------------------------------------------------
-- 1. Strip every non-SELECT privilege from the client roles, everywhere
------------------------------------------------------------------------
-- SELECT is deliberately excluded — reads are governed by RLS policies that
-- are present, reviewed, and doing real work.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER '
      'ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

------------------------------------------------------------------------
-- 2. Restore the single legitimate client write path
------------------------------------------------------------------------
-- Revoking a table-level privilege also drops column-level grants, so 024's
-- six-column grant has to be re-issued after the loop above, not before.
-- This is the reconcile background-fix in src/stores/invoice-store.ts:331-341.
GRANT UPDATE (amount, amount_paid, status, memo, payer, token_type)
  ON public.invoices TO authenticated;

-- service_role is untouched throughout and keeps full write access on every
-- table; chainhook, reconcile and the webhook sender are unaffected. It also
-- holds BYPASSRLS, so policies are not in its path either way.
