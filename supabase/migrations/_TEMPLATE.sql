-- TEMPLATE — do not run. Copy/paste into a new numbered migration.
--
-- Starting 2026-05-30 (new projects) and 2026-10-30 (existing projects),
-- Supabase no longer auto-grants public-schema tables to the Data API roles
-- (anon, authenticated, service_role). Any new table that should be reachable
-- via supabase-js / PostgREST / GraphQL must include explicit GRANTs, or
-- PostgREST returns a 42501 error.
--
-- RLS is separate from GRANTs. GRANT decides whether the role can see the
-- table at all via the Data API; RLS policies then decide which rows.
--
-- Pick the variant that matches the table's access pattern and delete the
-- others. Replace `your_table` and `your_table_id_seq` throughout.

------------------------------------------------------------------------
-- 1. Create the table
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.your_table (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- ... columns ...
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- CREATE INDEX ... as needed

------------------------------------------------------------------------
-- 2. Enable RLS
------------------------------------------------------------------------
ALTER TABLE public.your_table ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY ... as needed (omit policies entirely for service_role-only)

------------------------------------------------------------------------
-- 3. Grants — pick ONE variant
------------------------------------------------------------------------

-- Variant A: server-only (written by edge functions via service_role).
-- Example: webhook_dlq. anon/authenticated intentionally get nothing.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO service_role;

-- Variant B: client-reachable for authenticated users (supabase-js with JWT).
-- Example: webhook_deliveries. RLS policies gate which rows are visible.
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO service_role;

-- Variant C: public read (rare — e.g. a static lookup table).
-- GRANT SELECT ON public.your_table TO anon;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO authenticated;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON public.your_table TO service_role;

------------------------------------------------------------------------
-- 4. Sequence grants (only if the table uses a SERIAL/BIGSERIAL or a
--    sequence the client needs to use for INSERTs — IDENTITY columns
--    handled by the server don't need this).
------------------------------------------------------------------------
-- GRANT USAGE, SELECT ON SEQUENCE public.your_table_id_seq
--   TO authenticated, service_role;
