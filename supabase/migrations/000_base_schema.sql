-- =====================================================================
-- MAINNET SCHEMA SNAPSHOT — 2026-08-28
--
-- READ THIS BEFORE RUNNING IT. Despite the 000_ prefix, this file is NOT
-- the historical baseline that migrations 001-028 were built on top of.
-- It is a pg_dump of sbtc-pay-mainnet (kkkvlbdcgupesyzmmpqv) taken AFTER
-- all of them had been applied. The prefix reflects load order for a
-- from-scratch restore, not chronology.
--
-- DO NOT apply this and then replay 001-028. That re-runs 28 migrations
-- against a schema that already contains their result. Most are guarded
-- (IF NOT EXISTS / DROP ... IF EXISTS) and would no-op, but some are not,
-- and an incident is the wrong time to find out which.
--
-- It exists because the database was previously not reproducible from the
-- repo at all: the real 000_base_schema was applied to mainnet on
-- 2026-04-20 but never committed, so a rebuild was impossible.
--
-- ---------------------------------------------------------------------
-- VERIFIED AGAINST LIVE MAINNET on 2026-08-28
-- ---------------------------------------------------------------------
--   tables 13, columns 155, policies 26, functions 11,
--   constraints 30, indexes 39 (20 explicit + 19 PK/UNIQUE-backed)
--   md5 over every "table.column type" triple:
--     f30134ff797bcc669b5d18e204646f18   (dump and live are identical)
--
-- Confirmed to be MAINNET and not testnet: invoices.id / merchant_id /
-- status are `integer` here, where testnet uses bigint/smallint, and none
-- of testnet's three extra constraints appear.
--
-- Security posture is captured correctly, which is worth stating because
-- a restore that silently reverted it would be worse than no restore:
--   * merchants  - SELECT only for anon/authenticated (migration 024)
--   * invoices   - UPDATE narrowed to exactly six columns (024)
--   * backfill_payment - REVOKE ALL FROM PUBLIC, anon absent (026)
--   * RLS enabled on all 13 tables; events autovacuum tuning from 023
--
-- ---------------------------------------------------------------------
-- WHAT THIS FILE DOES **NOT** CONTAIN
-- ---------------------------------------------------------------------
-- pg_cron jobs. All 8 live in the `cron` schema, which a dump of `public`
-- does not touch. Restoring from this file alone gives a structurally
-- correct database with NOTHING SCHEDULED - no indexer heartbeat, no
-- reconciliation, no webhook retries, no retention pruning - and nothing
-- will report that. Recreate them from the migrations that define them:
--
--   reconcile-chain-state         */5 * * * *   001, re-auth'd in 021
--   merchant-webhook-retry        *   * * * *   015, work-gated in 027
--   indexer-heartbeat             *   * * * *   016, rewritten in 023
--   cleanup-used-signatures       */5 * * * *   019
--   chainhook-webhook-keepwarm    */4 * * * *   021
--   prune-heartbeats              7   * * * *   023
--   prune-cron-history            13  * * * *   023
--   prune-reconciliation-events   23  * * * *   027
--
-- Also absent: Edge Function code and their secrets (CHAINHOOK_AUTH_TOKEN,
-- SUPABASE_SERVICE_ROLE_KEY, PAYMENT_CONTRACT_ID), the chainhook predicate
-- registration, and Vault contents.
--
-- ---------------------------------------------------------------------
-- TO RESTORE A MAINNET-EQUIVALENT DATABASE
-- ---------------------------------------------------------------------
--   1. Apply this file to an empty project.
--   2. Recreate the 8 cron jobs above from their migrations.
--   3. Deploy the Edge Functions and set their secrets.
--   4. Re-register the chainhook predicate
--      (chainhook/predicates/payment-v6.json, mainnet half).
--   5. Seed platform_config: contract_owner, platform_fee_bps - both are
--      read from live chain state, so verify against get-contract-config
--      rather than copying the values here.
--
-- Regenerate with:
--   supabase link --project-ref kkkvlbdcgupesyzmmpqv
--   supabase db dump -f supabase/migrations/000_base_schema.sql
-- (NB: the CLI is normally linked to TESTNET - oggvlwdptcpwipxahhjn.)
-- =====================================================================

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";






CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."backfill_payment"("p_invoice_id" integer, "p_payer" "text", "p_amount" bigint, "p_tx_id" "text", "p_block_height" integer, "p_token_type" "text" DEFAULT 'sbtc'::"text", "p_fee" bigint DEFAULT NULL::bigint, "p_merchant_received" bigint DEFAULT NULL::bigint) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_merchant   text;
  v_caller     text;
  v_exists     boolean;
  v_pay_index  integer;
  v_fee        bigint;
  v_received   bigint;
  v_fee_bps    bigint;
BEGIN
  SELECT merchant_principal INTO v_merchant FROM invoices WHERE id = p_invoice_id;
  IF v_merchant IS NULL THEN RETURN 'denied'; END IF;

  v_caller := public.requesting_wallet_address();
  IF v_caller IS NULL OR v_caller <> v_merchant THEN RETURN 'denied'; END IF;

  IF p_tx_id IS NOT NULL AND p_tx_id <> '' THEN
    SELECT EXISTS(SELECT 1 FROM payments WHERE tx_id = p_tx_id) INTO v_exists;
    IF v_exists THEN RETURN 'duplicate'; END IF;
  END IF;

  IF p_fee IS NOT NULL THEN
    -- Preferred path: caller observed these on chain (payment-received prints
    -- {fee, merchant-received} alongside amount).
    v_fee      := p_fee;
    v_received := COALESCE(p_merchant_received, p_amount - p_fee);
  ELSE
    SELECT value::bigint INTO v_fee_bps
    FROM platform_config WHERE key = 'platform_fee_bps';

    IF v_fee_bps IS NULL THEN
      RAISE EXCEPTION
        'backfill_payment: no fee available. Pass p_fee from the chain event, '
        'or set platform_config.platform_fee_bps. Refusing to guess.';
    END IF;

    v_fee      := (p_amount * v_fee_bps) / 10000;
    v_received := p_amount - v_fee;
  END IF;

  SELECT COALESCE(MAX(payment_index), -1) + 1 INTO v_pay_index
  FROM payments WHERE invoice_id = p_invoice_id;

  INSERT INTO payments (invoice_id, payment_index, payer, merchant_principal,
                        amount, fee, merchant_received, block_height, tx_id, token_type)
  VALUES (p_invoice_id, v_pay_index, p_payer, v_merchant,
          p_amount, v_fee, v_received, p_block_height, NULLIF(p_tx_id, ''), p_token_type);

  RETURN 'inserted';
END;
$$;


ALTER FUNCTION "public"."backfill_payment"("p_invoice_id" integer, "p_payer" "text", "p_amount" bigint, "p_tx_id" "text", "p_block_height" integer, "p_token_type" "text", "p_fee" bigint, "p_merchant_received" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."backfill_refund"("p_invoice_id" integer, "p_amount" bigint, "p_reason" "text", "p_tx_id" "text", "p_block_height" integer, "p_token_type" "text" DEFAULT 'sbtc'::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_merchant   text;
  v_caller     text;
  v_exists     boolean;
  v_payer      text;
BEGIN
  SELECT merchant_principal, COALESCE(payer, '') INTO v_merchant, v_payer FROM invoices WHERE id = p_invoice_id;
  IF v_merchant IS NULL THEN RETURN 'denied'; END IF;

  v_caller := public.requesting_wallet_address();
  IF v_caller IS NULL OR v_caller <> v_merchant THEN RETURN 'denied'; END IF;

  IF p_tx_id IS NOT NULL AND p_tx_id <> '' THEN
    SELECT EXISTS(SELECT 1 FROM refunds WHERE tx_id = p_tx_id) INTO v_exists;
    IF v_exists THEN RETURN 'duplicate'; END IF;
  END IF;

  INSERT INTO refunds (invoice_id, merchant_principal, customer, amount, reason, processed_at_block, tx_id, token_type)
  VALUES (p_invoice_id, v_merchant, v_payer, p_amount, COALESCE(p_reason, ''), p_block_height, NULLIF(p_tx_id, ''), p_token_type);

  RETURN 'inserted';
END;
$$;


ALTER FUNCTION "public"."backfill_refund"("p_invoice_id" integer, "p_amount" bigint, "p_reason" "text", "p_tx_id" "text", "p_block_height" integer, "p_token_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_merchant_received"("p_principal" "text", "p_amount" bigint, "p_token_type" "text" DEFAULT 'sbtc'::"text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
BEGIN
  IF p_token_type = 'stx' THEN
    UPDATE public.merchants
    SET total_received_stx = total_received_stx + p_amount,
        total_received = total_received + p_amount,
        updated_at = now()
    WHERE principal = p_principal;
  ELSE
    UPDATE public.merchants
    SET total_received_sbtc = total_received_sbtc + p_amount,
        total_received = total_received + p_amount,
        updated_at = now()
    WHERE principal = p_principal;
  END IF;
END;
$$;


ALTER FUNCTION "public"."increment_merchant_received"("p_principal" "text", "p_amount" bigint, "p_token_type" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_platform_stat"("stat_name" "text", "increment_by" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
BEGIN
  EXECUTE format(
    'UPDATE public.platform_stats SET %I = COALESCE(%I, 0) + $1, updated_at = now() WHERE id = 1',
    stat_name, stat_name
  ) USING increment_by;
END;
$_$;


ALTER FUNCTION "public"."increment_platform_stat"("stat_name" "text", "increment_by" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."increment_platform_stats"("p_vol_col" "text", "p_vol_amount" bigint, "p_fee_col" "text", "p_fee_amount" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $_$
BEGIN
  IF p_vol_col NOT IN (
    'total_volume_sbtc', 'total_volume_stx',
    'total_fees_sbtc', 'total_fees_stx',
    'total_refunds_sbtc', 'total_refunds_stx'
  ) THEN
    RAISE EXCEPTION 'Invalid column name: %', p_vol_col;
  END IF;
  IF p_fee_col NOT IN (
    'total_volume_sbtc', 'total_volume_stx',
    'total_fees_sbtc', 'total_fees_stx',
    'total_refunds_sbtc', 'total_refunds_stx'
  ) THEN
    RAISE EXCEPTION 'Invalid column name: %', p_fee_col;
  END IF;

  IF p_vol_col = p_fee_col THEN
    EXECUTE format(
      'UPDATE platform_stats SET %I = COALESCE(%I, 0) + $1 WHERE id = 1',
      p_vol_col, p_vol_col
    ) USING p_vol_amount + p_fee_amount;
  ELSE
    EXECUTE format(
      'UPDATE platform_stats SET %I = COALESCE(%I, 0) + $1, %I = COALESCE(%I, 0) + $2 WHERE id = 1',
      p_vol_col, p_vol_col, p_fee_col, p_fee_col
    ) USING p_vol_amount, p_fee_amount;
  END IF;
END;
$_$;


ALTER FUNCTION "public"."increment_platform_stats"("p_vol_col" "text", "p_vol_amount" bigint, "p_fee_col" "text", "p_fee_amount" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_platform_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_config
    WHERE key = 'contract_owner'
      AND value = public.requesting_wallet_address()
  );
$$;


ALTER FUNCTION "public"."is_platform_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."requesting_wallet"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT NULLIF(auth.jwt()->>'sub', '');
$$;


ALTER FUNCTION "public"."requesting_wallet"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."requesting_wallet_address"() RETURNS "text"
    LANGUAGE "sql" STABLE
    AS $$
  SELECT NULLIF(auth.jwt()->>'sub', '');
$$;


ALTER FUNCTION "public"."requesting_wallet_address"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_merchant_cache"("p_id" integer, "p_principal" "text", "p_name" "text", "p_description" "text" DEFAULT NULL::"text", "p_logo_url" "text" DEFAULT NULL::"text", "p_webhook_url" "text" DEFAULT NULL::"text", "p_is_active" boolean DEFAULT true, "p_is_verified" boolean DEFAULT false, "p_registered_at" bigint DEFAULT 0) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_caller text;
BEGIN
  v_caller := public.requesting_wallet_address();
  IF v_caller IS NOT NULL AND v_caller <> p_principal THEN
    RAISE EXCEPTION 'denied: wallet does not match merchant principal';
  END IF;

  INSERT INTO public.merchants (
    id, principal, name, description, logo_url, webhook_url,
    is_active, is_verified, registered_at
  )
  VALUES (
    p_id, p_principal, p_name, p_description, p_logo_url, p_webhook_url,
    p_is_active, false, p_registered_at
  )
  ON CONFLICT (id) DO UPDATE SET
    name         = EXCLUDED.name,
    description  = EXCLUDED.description,
    logo_url     = EXCLUDED.logo_url,
    webhook_url  = EXCLUDED.webhook_url,
    is_active    = EXCLUDED.is_active,
    updated_at   = now();
END;
$$;


ALTER FUNCTION "public"."sync_merchant_cache"("p_id" integer, "p_principal" "text", "p_name" "text", "p_description" "text", "p_logo_url" "text", "p_webhook_url" "text", "p_is_active" boolean, "p_is_verified" boolean, "p_registered_at" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."vault_get"("p_name" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  v_value text;
BEGIN
  SELECT decrypted_secret INTO v_value
  FROM vault.decrypted_secrets
  WHERE name = p_name
  LIMIT 1;
  IF v_value IS NULL OR v_value = '' THEN
    RAISE EXCEPTION 'vault secret % is not set (see migration 021 header for per-env setup)', p_name;
  END IF;
  RETURN v_value;
END;
$$;


ALTER FUNCTION "public"."vault_get"("p_name" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."direct_payments" (
    "id" bigint NOT NULL,
    "payer" "text" NOT NULL,
    "merchant_principal" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "fee" bigint DEFAULT 0 NOT NULL,
    "merchant_received" bigint DEFAULT 0 NOT NULL,
    "memo" "text" DEFAULT ''::"text" NOT NULL,
    "block_height" integer NOT NULL,
    "tx_id" "text",
    "token_type" "text" DEFAULT 'sbtc'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_direct_payments_token_type" CHECK (("token_type" = ANY (ARRAY['sbtc'::"text", 'stx'::"text"])))
);


ALTER TABLE "public"."direct_payments" OWNER TO "postgres";


ALTER TABLE "public"."direct_payments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."direct_payments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" bigint NOT NULL,
    "event_type" "text" NOT NULL,
    "tx_id" "text" NOT NULL,
    "block_height" integer NOT NULL,
    "block_hash" "text",
    "contract_identifier" "text",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "token_type" "text",
    "processed_at" timestamp with time zone DEFAULT "now"() NOT NULL
)
WITH ("autovacuum_vacuum_scale_factor"='0.02', "autovacuum_vacuum_threshold"='1000', "autovacuum_analyze_scale_factor"='0.02', "autovacuum_analyze_threshold"='1000');


ALTER TABLE "public"."events" OWNER TO "postgres";


ALTER TABLE "public"."events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."invoices" (
    "id" integer NOT NULL,
    "merchant_id" integer NOT NULL,
    "merchant_principal" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "amount_paid" bigint DEFAULT 0 NOT NULL,
    "amount_refunded" bigint DEFAULT 0 NOT NULL,
    "memo" "text" DEFAULT ''::"text" NOT NULL,
    "reference_id" "text",
    "status" integer DEFAULT 0 NOT NULL,
    "payer" "text",
    "allow_partial" boolean DEFAULT false NOT NULL,
    "allow_overpay" boolean DEFAULT false NOT NULL,
    "created_at_block" integer NOT NULL,
    "expires_at_block" integer NOT NULL,
    "paid_at_block" integer,
    "refunded_at_block" integer,
    "token_type" "text" DEFAULT 'sbtc'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_invoices_token_type" CHECK (("token_type" = ANY (ARRAY['sbtc'::"text", 'stx'::"text"])))
);


ALTER TABLE "public"."invoices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."merchants" (
    "id" integer NOT NULL,
    "principal" "text" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text",
    "logo_url" "text",
    "webhook_url" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "is_verified" boolean DEFAULT false NOT NULL,
    "registered_at" integer DEFAULT 0 NOT NULL,
    "invoice_count" integer DEFAULT 0 NOT NULL,
    "subscription_count" integer DEFAULT 0 NOT NULL,
    "total_received" bigint DEFAULT 0 NOT NULL,
    "total_refunded" bigint DEFAULT 0 NOT NULL,
    "total_received_sbtc" bigint DEFAULT 0 NOT NULL,
    "total_refunded_sbtc" bigint DEFAULT 0 NOT NULL,
    "total_received_stx" bigint DEFAULT 0 NOT NULL,
    "total_refunded_stx" bigint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "webhook_secret" "text"
);


ALTER TABLE "public"."merchants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" bigint NOT NULL,
    "invoice_id" integer NOT NULL,
    "payment_index" integer NOT NULL,
    "payer" "text" NOT NULL,
    "merchant_principal" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "fee" bigint DEFAULT 0 NOT NULL,
    "merchant_received" bigint DEFAULT 0 NOT NULL,
    "block_height" integer NOT NULL,
    "tx_id" "text",
    "token_type" "text" DEFAULT 'sbtc'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_payments_token_type" CHECK (("token_type" = ANY (ARRAY['sbtc'::"text", 'stx'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


ALTER TABLE "public"."payments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."payments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."platform_config" (
    "key" "text" NOT NULL,
    "value" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."platform_stats" (
    "id" integer DEFAULT 1 NOT NULL,
    "total_merchants" integer DEFAULT 0 NOT NULL,
    "total_invoices" integer DEFAULT 0 NOT NULL,
    "total_subscriptions" integer DEFAULT 0 NOT NULL,
    "total_volume" bigint DEFAULT 0 NOT NULL,
    "total_fees_collected" bigint DEFAULT 0 NOT NULL,
    "total_refunds" bigint DEFAULT 0 NOT NULL,
    "total_volume_sbtc" bigint DEFAULT 0 NOT NULL,
    "total_fees_sbtc" bigint DEFAULT 0 NOT NULL,
    "total_refunds_sbtc" bigint DEFAULT 0 NOT NULL,
    "total_volume_stx" bigint DEFAULT 0 NOT NULL,
    "total_fees_stx" bigint DEFAULT 0 NOT NULL,
    "total_refunds_stx" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."platform_stats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."refunds" (
    "id" bigint NOT NULL,
    "invoice_id" integer NOT NULL,
    "merchant_principal" "text" NOT NULL,
    "customer" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "processed_at_block" integer NOT NULL,
    "tx_id" "text",
    "token_type" "text" DEFAULT 'sbtc'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_refunds_token_type" CHECK (("token_type" = ANY (ARRAY['sbtc'::"text", 'stx'::"text"])))
);


ALTER TABLE "public"."refunds" OWNER TO "postgres";


ALTER TABLE "public"."refunds" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."refunds_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."subscription_payments" (
    "id" bigint NOT NULL,
    "subscription_id" integer NOT NULL,
    "merchant_principal" "text" NOT NULL,
    "subscriber" "text" NOT NULL,
    "payment_number" integer NOT NULL,
    "amount" bigint NOT NULL,
    "fee" bigint DEFAULT 0 NOT NULL,
    "merchant_received" bigint DEFAULT 0 NOT NULL,
    "block_height" integer NOT NULL,
    "tx_id" "text",
    "token_type" "text" DEFAULT 'sbtc'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_subscription_payments_token_type" CHECK (("token_type" = ANY (ARRAY['sbtc'::"text", 'stx'::"text"])))
);


ALTER TABLE "public"."subscription_payments" OWNER TO "postgres";


ALTER TABLE "public"."subscription_payments" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."subscription_payments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."subscriptions" (
    "id" integer NOT NULL,
    "merchant_id" integer NOT NULL,
    "merchant_principal" "text" NOT NULL,
    "subscriber" "text" NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "amount" bigint NOT NULL,
    "interval_blocks" integer NOT NULL,
    "status" integer DEFAULT 0 NOT NULL,
    "payments_made" integer DEFAULT 0 NOT NULL,
    "total_paid" bigint DEFAULT 0 NOT NULL,
    "created_at_block" integer NOT NULL,
    "last_payment_at_block" integer DEFAULT 0 NOT NULL,
    "next_payment_at_block" integer NOT NULL,
    "token_type" "text" DEFAULT 'sbtc'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "chk_subscriptions_token_type" CHECK (("token_type" = ANY (ARRAY['sbtc'::"text", 'stx'::"text"])))
);


ALTER TABLE "public"."subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."used_signatures" (
    "signature_hash" "text" NOT NULL,
    "used_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expires_at" timestamp with time zone NOT NULL
);


ALTER TABLE "public"."used_signatures" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."webhook_deliveries" (
    "id" bigint NOT NULL,
    "merchant_id" "text" NOT NULL,
    "merchant_principal" "text" NOT NULL,
    "webhook_url" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "tx_id" "text",
    "block_height" bigint,
    "payload" "jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "last_status_code" integer,
    "last_error" "text",
    "next_attempt_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_attempted_at" timestamp with time zone,
    "delivered_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."webhook_deliveries" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."webhook_deliveries_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."webhook_deliveries_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."webhook_deliveries_id_seq" OWNED BY "public"."webhook_deliveries"."id";



CREATE TABLE IF NOT EXISTS "public"."webhook_dlq" (
    "id" bigint NOT NULL,
    "event_type" "text" NOT NULL,
    "tx_id" "text" NOT NULL,
    "block_height" bigint DEFAULT 0 NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error_message" "text" DEFAULT ''::"text" NOT NULL,
    "attempts" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_attempted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone
);


ALTER TABLE "public"."webhook_dlq" OWNER TO "postgres";


COMMENT ON TABLE "public"."webhook_dlq" IS 'Dead-letter queue for chainhook webhook events that failed processing';



ALTER TABLE "public"."webhook_dlq" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."webhook_dlq_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



ALTER TABLE ONLY "public"."webhook_deliveries" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."webhook_deliveries_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."direct_payments"
    ADD CONSTRAINT "direct_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."direct_payments"
    ADD CONSTRAINT "direct_payments_tx_id_key" UNIQUE ("tx_id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_tx_id_event_type_unique" UNIQUE ("tx_id", "event_type");



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."merchants"
    ADD CONSTRAINT "merchants_principal_key" UNIQUE ("principal");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_tx_id_key" UNIQUE ("tx_id");



ALTER TABLE ONLY "public"."platform_config"
    ADD CONSTRAINT "platform_config_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."platform_stats"
    ADD CONSTRAINT "platform_stats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_tx_id_key" UNIQUE ("tx_id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."used_signatures"
    ADD CONSTRAINT "used_signatures_pkey" PRIMARY KEY ("signature_hash");



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_idempotency_key" UNIQUE ("merchant_principal", "tx_id", "event_type");



ALTER TABLE ONLY "public"."webhook_deliveries"
    ADD CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."webhook_dlq"
    ADD CONSTRAINT "webhook_dlq_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_direct_payments_merchant" ON "public"."direct_payments" USING "btree" ("merchant_principal");



CREATE INDEX "idx_events_real_block" ON "public"."events" USING "btree" ("block_height" DESC) WHERE ("event_type" <> 'heartbeat'::"text");



CREATE INDEX "idx_events_type_processed" ON "public"."events" USING "btree" ("event_type", "processed_at" DESC);



CREATE INDEX "idx_invoices_merchant" ON "public"."invoices" USING "btree" ("merchant_principal");



CREATE INDEX "idx_invoices_status" ON "public"."invoices" USING "btree" ("status");



CREATE INDEX "idx_invoices_token_type" ON "public"."invoices" USING "btree" ("token_type");



CREATE INDEX "idx_merchants_principal" ON "public"."merchants" USING "btree" ("principal");



CREATE INDEX "idx_payments_invoice" ON "public"."payments" USING "btree" ("invoice_id");



CREATE INDEX "idx_payments_token_type" ON "public"."payments" USING "btree" ("token_type");



CREATE INDEX "idx_payments_tx" ON "public"."payments" USING "btree" ("tx_id");



CREATE INDEX "idx_refunds_invoice" ON "public"."refunds" USING "btree" ("invoice_id");



CREATE INDEX "idx_sub_payments_subscription" ON "public"."subscription_payments" USING "btree" ("subscription_id");



CREATE INDEX "idx_subscriptions_merchant" ON "public"."subscriptions" USING "btree" ("merchant_principal");



CREATE INDEX "idx_subscriptions_subscriber" ON "public"."subscriptions" USING "btree" ("subscriber");



CREATE INDEX "idx_subscriptions_token_type" ON "public"."subscriptions" USING "btree" ("token_type");



CREATE INDEX "idx_used_signatures_expires_at" ON "public"."used_signatures" USING "btree" ("expires_at");



CREATE INDEX "idx_webhook_deliveries_merchant" ON "public"."webhook_deliveries" USING "btree" ("merchant_principal", "created_at" DESC);



CREATE INDEX "idx_webhook_deliveries_pending" ON "public"."webhook_deliveries" USING "btree" ("status", "next_attempt_at") WHERE ("status" = 'pending'::"text");



CREATE INDEX "idx_webhook_dlq_tx_event" ON "public"."webhook_dlq" USING "btree" ("tx_id", "event_type") WHERE ("resolved_at" IS NULL);



CREATE INDEX "idx_webhook_dlq_unresolved" ON "public"."webhook_dlq" USING "btree" ("created_at") WHERE ("resolved_at" IS NULL);



ALTER TABLE ONLY "public"."invoices"
    ADD CONSTRAINT "invoices_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id");



ALTER TABLE ONLY "public"."refunds"
    ADD CONSTRAINT "refunds_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id");



ALTER TABLE ONLY "public"."subscription_payments"
    ADD CONSTRAINT "subscription_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id");



ALTER TABLE ONLY "public"."subscriptions"
    ADD CONSTRAINT "subscriptions_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "public"."merchants"("id");



CREATE POLICY "Admin read all direct payments" ON "public"."direct_payments" FOR SELECT USING ("public"."is_platform_admin"());



CREATE POLICY "Admin read all invoices" ON "public"."invoices" FOR SELECT USING ("public"."is_platform_admin"());



CREATE POLICY "Admin read all merchants" ON "public"."merchants" FOR SELECT USING ("public"."is_platform_admin"());



CREATE POLICY "Admin read all payments" ON "public"."payments" FOR SELECT USING ("public"."is_platform_admin"());



CREATE POLICY "Admin read all refunds" ON "public"."refunds" FOR SELECT USING ("public"."is_platform_admin"());



CREATE POLICY "Admin read all subscription payments" ON "public"."subscription_payments" FOR SELECT USING ("public"."is_platform_admin"());



CREATE POLICY "Admin read all subscriptions" ON "public"."subscriptions" FOR SELECT USING ("public"."is_platform_admin"());



CREATE POLICY "Authenticated users read events" ON "public"."events" FOR SELECT USING (("public"."requesting_wallet_address"() IS NOT NULL));



CREATE POLICY "Merchants read own direct payments" ON "public"."direct_payments" FOR SELECT USING (("merchant_principal" = "public"."requesting_wallet_address"()));



CREATE POLICY "Merchants read own invoices" ON "public"."invoices" FOR SELECT USING (("merchant_principal" = "public"."requesting_wallet_address"()));



CREATE POLICY "Merchants read own payments" ON "public"."payments" FOR SELECT USING (("merchant_principal" = "public"."requesting_wallet_address"()));



CREATE POLICY "Merchants read own record" ON "public"."merchants" FOR SELECT USING (("principal" = "public"."requesting_wallet_address"()));



CREATE POLICY "Merchants read own refunds" ON "public"."refunds" FOR SELECT USING (("merchant_principal" = "public"."requesting_wallet_address"()));



CREATE POLICY "Merchants read own subscription payments" ON "public"."subscription_payments" FOR SELECT USING (("merchant_principal" = "public"."requesting_wallet_address"()));



CREATE POLICY "Merchants read own subscriptions" ON "public"."subscriptions" FOR SELECT USING (("merchant_principal" = "public"."requesting_wallet_address"()));



CREATE POLICY "Merchants update own invoices" ON "public"."invoices" FOR UPDATE USING (("merchant_principal" = "public"."requesting_wallet_address"()));



CREATE POLICY "Merchants update own record" ON "public"."merchants" FOR UPDATE USING (("principal" = "public"."requesting_wallet_address"()));



CREATE POLICY "Public read invoices for payment" ON "public"."invoices" FOR SELECT USING (true);



CREATE POLICY "Public read payments" ON "public"."payments" FOR SELECT USING (true);



CREATE POLICY "Public read platform config" ON "public"."platform_config" FOR SELECT USING (true);



CREATE POLICY "Public read platform stats" ON "public"."platform_stats" FOR SELECT USING (true);



CREATE POLICY "Public read refunds" ON "public"."refunds" FOR SELECT USING (true);



CREATE POLICY "Subscribers read own subscription payments" ON "public"."subscription_payments" FOR SELECT USING (("subscriber" = "public"."requesting_wallet_address"()));



CREATE POLICY "Subscribers read own subscriptions" ON "public"."subscriptions" FOR SELECT USING (("subscriber" = "public"."requesting_wallet_address"()));



CREATE POLICY "admins_can_read_webhook_dlq" ON "public"."webhook_dlq" FOR SELECT TO "authenticated" USING ("public"."is_platform_admin"());



ALTER TABLE "public"."direct_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."invoices" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."merchants" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."platform_stats" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."refunds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscription_payments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."used_signatures" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."webhook_deliveries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "webhook_deliveries_read_own" ON "public"."webhook_deliveries" FOR SELECT USING (("merchant_principal" = (("current_setting"('request.jwt.claims'::"text", true))::"jsonb" ->> 'sub'::"text")));



ALTER TABLE "public"."webhook_dlq" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."direct_payments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."merchants";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."payments";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."subscription_payments";









GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";











































































































































































REVOKE ALL ON FUNCTION "public"."backfill_payment"("p_invoice_id" integer, "p_payer" "text", "p_amount" bigint, "p_tx_id" "text", "p_block_height" integer, "p_token_type" "text", "p_fee" bigint, "p_merchant_received" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backfill_payment"("p_invoice_id" integer, "p_payer" "text", "p_amount" bigint, "p_tx_id" "text", "p_block_height" integer, "p_token_type" "text", "p_fee" bigint, "p_merchant_received" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."backfill_payment"("p_invoice_id" integer, "p_payer" "text", "p_amount" bigint, "p_tx_id" "text", "p_block_height" integer, "p_token_type" "text", "p_fee" bigint, "p_merchant_received" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."backfill_refund"("p_invoice_id" integer, "p_amount" bigint, "p_reason" "text", "p_tx_id" "text", "p_block_height" integer, "p_token_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."backfill_refund"("p_invoice_id" integer, "p_amount" bigint, "p_reason" "text", "p_tx_id" "text", "p_block_height" integer, "p_token_type" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."backfill_refund"("p_invoice_id" integer, "p_amount" bigint, "p_reason" "text", "p_tx_id" "text", "p_block_height" integer, "p_token_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_merchant_received"("p_principal" "text", "p_amount" bigint, "p_token_type" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_merchant_received"("p_principal" "text", "p_amount" bigint, "p_token_type" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_platform_stat"("stat_name" "text", "increment_by" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_platform_stat"("stat_name" "text", "increment_by" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."increment_platform_stats"("p_vol_col" "text", "p_vol_amount" bigint, "p_fee_col" "text", "p_fee_amount" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."increment_platform_stats"("p_vol_col" "text", "p_vol_amount" bigint, "p_fee_col" "text", "p_fee_amount" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."requesting_wallet"() TO "anon";
GRANT ALL ON FUNCTION "public"."requesting_wallet"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."requesting_wallet"() TO "service_role";



GRANT ALL ON FUNCTION "public"."requesting_wallet_address"() TO "anon";
GRANT ALL ON FUNCTION "public"."requesting_wallet_address"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."requesting_wallet_address"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rls_auto_enable"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_merchant_cache"("p_id" integer, "p_principal" "text", "p_name" "text", "p_description" "text", "p_logo_url" "text", "p_webhook_url" "text", "p_is_active" boolean, "p_is_verified" boolean, "p_registered_at" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_merchant_cache"("p_id" integer, "p_principal" "text", "p_name" "text", "p_description" "text", "p_logo_url" "text", "p_webhook_url" "text", "p_is_active" boolean, "p_is_verified" boolean, "p_registered_at" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_merchant_cache"("p_id" integer, "p_principal" "text", "p_name" "text", "p_description" "text", "p_logo_url" "text", "p_webhook_url" "text", "p_is_active" boolean, "p_is_verified" boolean, "p_registered_at" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."vault_get"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."vault_get"("p_name" "text") TO "service_role";
























GRANT SELECT,MAINTAIN ON TABLE "public"."direct_payments" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."direct_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."direct_payments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."direct_payments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."direct_payments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."direct_payments_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."events" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."events_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."invoices" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."invoices" TO "authenticated";
GRANT ALL ON TABLE "public"."invoices" TO "service_role";



GRANT UPDATE("amount") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("amount_paid") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("memo") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("status") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("payer") ON TABLE "public"."invoices" TO "authenticated";



GRANT UPDATE("token_type") ON TABLE "public"."invoices" TO "authenticated";



GRANT SELECT,MAINTAIN ON TABLE "public"."merchants" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."merchants" TO "authenticated";
GRANT ALL ON TABLE "public"."merchants" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."payments" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."payments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."payments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."payments_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."platform_config" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."platform_config" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_config" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."platform_stats" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."platform_stats" TO "authenticated";
GRANT ALL ON TABLE "public"."platform_stats" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."refunds" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."refunds" TO "authenticated";
GRANT ALL ON TABLE "public"."refunds" TO "service_role";



GRANT ALL ON SEQUENCE "public"."refunds_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."refunds_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."refunds_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."subscription_payments" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."subscription_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."subscription_payments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."subscription_payments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."subscription_payments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."subscription_payments_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."subscriptions" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."subscriptions" TO "authenticated";
GRANT ALL ON TABLE "public"."subscriptions" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."used_signatures" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."used_signatures" TO "authenticated";
GRANT ALL ON TABLE "public"."used_signatures" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."webhook_deliveries" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."webhook_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_deliveries" TO "service_role";



GRANT ALL ON SEQUENCE "public"."webhook_deliveries_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."webhook_deliveries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."webhook_deliveries_id_seq" TO "service_role";



GRANT SELECT,MAINTAIN ON TABLE "public"."webhook_dlq" TO "anon";
GRANT SELECT,MAINTAIN ON TABLE "public"."webhook_dlq" TO "authenticated";
GRANT ALL ON TABLE "public"."webhook_dlq" TO "service_role";



GRANT ALL ON SEQUENCE "public"."webhook_dlq_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."webhook_dlq_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."webhook_dlq_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































