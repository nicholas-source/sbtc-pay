// @ts-nocheck — Deno runtime types; VS Code TypeScript can't resolve esm.sh imports
/**
 * Reconciliation Edge Function
 *
 * Self-healing cron that reads on-chain state (source of truth) and corrects
 * any drift in the Supabase cache.  Designed to run every 5 minutes via
 * pg_cron or an external scheduler (e.g. Vercel Cron / GitHub Actions).
 *
 * What it reconciles:
 *   1. Platform stats  (total merchants, invoices, subscriptions, volume, fees)
 *   2. Merchants       (name, description, active/verified, totals)
 *   3. Invoices        (amount, amount_paid, status, expires_at_block, payer)
 *   4. Subscriptions   (status, payments_made, next_payment_at_block)
 *
 * The function reads counters from get-platform-stats first, then iterates
 * individual entities up to those counters.
 *
 * Auth: expects RECONCILE_SECRET in the Authorization header, or
 *       SUPABASE_SERVICE_ROLE_KEY as fallback for direct invocations.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  Cl,
  fetchCallReadOnlyFunction,
  cvToJSON,
  deserializeCV,
} from "https://esm.sh/@stacks/transactions@7";

// ---------- ENV ----------
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RECONCILE_SECRET = Deno.env.get("RECONCILE_SECRET") ?? SUPABASE_SERVICE_ROLE_KEY;

const NETWORK: "testnet" | "mainnet" = (Deno.env.get("NETWORK_MODE") ?? "testnet") as "testnet" | "mainnet";
const API_URL = NETWORK === "testnet"
  ? "https://api.testnet.hiro.so"
  : "https://api.mainnet.hiro.so";

// Contract identifier — payment-v6
const CONTRACT_ID = Deno.env.get("PAYMENT_CONTRACT_ID")
  ?? "STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR.payment-v6";
const [CONTRACT_ADDRESS, CONTRACT_NAME] = CONTRACT_ID.split(".");

// A valid sender address for read-only calls (doesn't need to own anything)
const SENDER_ADDRESS = CONTRACT_ADDRESS;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// ---------- HELPERS ----------

// Timing-safe auth comparison
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const enc = new TextEncoder();
  const bufA = enc.encode(a);
  const bufB = enc.encode(b);
  let mismatch = 0;
  for (let i = 0; i < bufA.length; i++) mismatch |= bufA[i] ^ bufB[i];
  return mismatch === 0;
}

/**
 * Flatten cvToJSON output into plain JS values.
 * Mirrors the same logic used in the chainhook-webhook function.
 */
// deno-lint-ignore no-explicit-any
function flattenCvJson(cv: any): unknown {
  if (cv === null || cv === undefined) return null;
  if (typeof cv !== "object") return cv;

  const t = cv.type as string;
  const v = cv.value;

  if (t === "uint" || t === "uint128" || t === "int" || t === "int128") return Number(v);
  if (t === "bool") return v;
  if (t === "principal") return v;
  if (t?.startsWith("(string-ascii") || t?.startsWith("(string-utf8")) return v;
  if (t?.startsWith("buff") || t?.startsWith("(buff")) return v;
  if (t === "none") return null;
  if (t?.startsWith("(optional") || t?.startsWith("(some")) {
    if (v === null || v === undefined) return null;
    return flattenCvJson(v);
  }
  if (t?.startsWith("(response") || t?.startsWith("(ok") || t?.startsWith("(err")) {
    return flattenCvJson(v);
  }
  if (t?.startsWith("(tuple") && typeof v === "object" && v !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(v)) result[key] = flattenCvJson(val);
    return result;
  }
  if (t?.startsWith("(list") && Array.isArray(v)) return v.map(flattenCvJson);
  if (v !== undefined) return flattenCvJson(v);
  return cv;
}

/** Call a read-only contract function and return flattened JS value. */
async function callReadOnly(
  functionName: string,
  functionArgs: ReturnType<typeof Cl.uint>[],
): Promise<Record<string, unknown> | null> {
  try {
    const result = await fetchCallReadOnlyFunction({
      contractAddress: CONTRACT_ADDRESS,
      contractName: CONTRACT_NAME,
      functionName,
      functionArgs,
      network: NETWORK,
      senderAddress: SENDER_ADDRESS,
    });
    const json = cvToJSON(result);
    const flat = flattenCvJson(json);
    if (flat && typeof flat === "object") return flat as Record<string, unknown>;
    return null;
  } catch (e) {
    console.warn(`callReadOnly(${functionName}) failed:`, e);
    return null;
  }
}

/** Fetch current burn (Bitcoin) block height from Stacks API. */
async function fetchBurnBlockHeight(): Promise<number> {
  const res = await fetch(`${API_URL}/v2/info`);
  if (!res.ok) throw new Error("Failed to fetch block height");
  const data = await res.json();
  return data.burn_block_height ?? 0;
}

// ---------- RECONCILERS ----------

interface ReconcileResult {
  platformStats: boolean;
  merchants: { total: number; corrected: number };
  invoices: { total: number; corrected: number };
  subscriptions: { total: number; corrected: number };
  burnBlockHeight: number;
  durationMs: number;
}

/** 1. Reconcile platform_stats table */
async function reconcilePlatformStats(
  chainStats: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await supabase.from("platform_stats").upsert(
    {
      id: 1,
      total_merchants: chainStats["total-merchants"],
      total_invoices: chainStats["total-invoices"],
      total_subscriptions: chainStats["total-subscriptions"],
      total_volume_sbtc: chainStats["total-volume-sbtc"],
      total_fees_sbtc: chainStats["total-fees-collected-sbtc"],
      total_refunds_sbtc: chainStats["total-refunds-sbtc"],
      total_volume_stx: chainStats["total-volume-stx"],
      total_fees_stx: chainStats["total-fees-collected-stx"],
      total_refunds_stx: chainStats["total-refunds-stx"],
    },
    { onConflict: "id" },
  );
  if (error) {
    console.error("reconcilePlatformStats error:", error);
    return false;
  }
  return true;
}

/** 2. Reconcile merchants — walk all known merchant principals in Supabase */
async function reconcileMerchants(): Promise<{ total: number; corrected: number }> {
  const { data: rows } = await supabase
    .from("merchants")
    .select("id, principal, name, is_active, is_verified, total_received_sbtc, total_refunded_sbtc, total_received_stx, total_refunded_stx");

  if (!rows || rows.length === 0) return { total: 0, corrected: 0 };

  let corrected = 0;

  // Process merchants in parallel batches of 5
  const BATCH = 5;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const results = await Promise.allSettled(
      batch.map(async (row) => {
        const chain = await callReadOnly("get-merchant", [Cl.principal(row.principal)]);
        if (!chain) return; // merchant not on chain (shouldn't happen)

        const updates: Record<string, unknown> = {};
        if (chain.name && chain.name !== row.name) updates.name = chain.name;
        if (chain.description !== undefined) updates.description = chain.description;
        if (chain["webhook-url"] !== undefined) updates.webhook_url = chain["webhook-url"];
        if (chain["logo-url"] !== undefined) updates.logo_url = chain["logo-url"];

        const chainActive = Boolean(chain["is-active"]);
        const chainVerified = Boolean(chain["is-verified"]);
        if (chainActive !== row.is_active) updates.is_active = chainActive;
        if (chainVerified !== row.is_verified) updates.is_verified = chainVerified;

        const chainReceivedSbtc = Number(chain["total-received-sbtc"] ?? 0);
        const chainRefundedSbtc = Number(chain["total-refunded-sbtc"] ?? 0);
        const chainReceivedStx = Number(chain["total-received-stx"] ?? 0);
        const chainRefundedStx = Number(chain["total-refunded-stx"] ?? 0);
        if (chainReceivedSbtc !== Number(row.total_received_sbtc ?? 0)) updates.total_received_sbtc = chainReceivedSbtc;
        if (chainRefundedSbtc !== Number(row.total_refunded_sbtc ?? 0)) updates.total_refunded_sbtc = chainRefundedSbtc;
        if (chainReceivedStx !== Number(row.total_received_stx ?? 0)) updates.total_received_stx = chainReceivedStx;
        if (chainRefundedStx !== Number(row.total_refunded_stx ?? 0)) updates.total_refunded_stx = chainRefundedStx;

        if (Object.keys(updates).length > 0) {
          const { error } = await supabase.from("merchants").update(updates).eq("id", row.id);
          if (error) console.error(`merchant ${row.id} update error:`, error);
          else corrected++;
        }
      }),
    );
    // Log failures
    results.forEach((r, idx) => {
      if (r.status === "rejected") console.warn(`merchant reconcile failed for ${batch[idx].principal}:`, r.reason);
    });
  }

  return { total: rows.length, corrected };
}

/** 3. Reconcile invoices — iterate 1..totalInvoices from chain */
async function reconcileInvoices(
  totalInvoices: number,
  burnHeight: number,
): Promise<{ total: number; corrected: number }> {
  if (totalInvoices === 0) return { total: 0, corrected: 0 };

  // Status mapping: chain numeric → label
  const STATUS_MAP: Record<number, number> = {
    0: 0, // pending
    1: 1, // partial
    2: 2, // paid
    3: 3, // expired
    4: 4, // cancelled
    5: 5, // refunded
  };

  let corrected = 0;
  const BATCH = 5;

  for (let i = 1; i <= totalInvoices; i += BATCH) {
    const batchIds = Array.from({ length: Math.min(BATCH, totalInvoices - i + 1) }, (_, k) => i + k);
    const results = await Promise.allSettled(
      batchIds.map(async (invoiceId) => {
        const chain = await callReadOnly("get-invoice", [Cl.uint(invoiceId)]);
        if (!chain) return;

        // Determine effective status — apply client-side expiration
        let chainStatus = Number(chain.status ?? 0);
        const expiresAt = Number(chain["expires-at"] ?? 0);
        if (
          (chainStatus === 0 || chainStatus === 1) &&
          expiresAt > 0 &&
          burnHeight > expiresAt
        ) {
          chainStatus = 3; // expired
        }

        const chainAmountPaid = Number(chain["amount-paid"] ?? 0);
        const chainAmountRefunded = Number(chain["amount-refunded"] ?? 0);
        const chainAmount = Number(chain.amount ?? 0);
        const chainPayer = chain.payer ? String(chain.payer) : null;
        const chainMerchant = String(chain.merchant ?? "");

        // Get current Supabase row
        const { data: row } = await supabase
          .from("invoices")
          .select("id, status, amount, amount_paid, amount_refunded, created_at_block, expires_at_block, payer, merchant_principal")
          .eq("id", invoiceId)
          .single();

        if (!row) {
          // Invoice exists on-chain but missing from Supabase — insert it
          // Look up merchant_id
          const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("principal", chainMerchant)
            .single();

          await supabase.from("invoices").upsert(
            {
              id: invoiceId,
              merchant_id: merchant?.id ?? null,
              merchant_principal: chainMerchant,
              amount: chainAmount,
              amount_paid: chainAmountPaid,
              amount_refunded: chainAmountRefunded,
              memo: chain.memo ? String(chain.memo) : "",
              reference_id: chain["reference-id"] ? String(chain["reference-id"]) : null,
              status: chainStatus,
              payer: chainPayer,
              allow_partial: Boolean(chain["allow-partial"]),
              created_at_block: Number(chain["created-at"] ?? 0),
              expires_at_block: expiresAt,
              token_type: Number(chain["token-type"] ?? 0) === 1 ? "stx" : "sbtc",
            },
            { onConflict: "id" },
          );
          corrected++;
          return;
        }

        // Compare and update if drifted
        const chainCreatedAt = Number(chain["created-at"] ?? 0);
        const updates: Record<string, unknown> = {};
        if (chainStatus !== row.status) updates.status = chainStatus;
        if (chainAmount !== Number(row.amount ?? 0)) updates.amount = chainAmount;
        if (chainAmountPaid !== Number(row.amount_paid ?? 0)) updates.amount_paid = chainAmountPaid;
        if (chainAmountRefunded !== Number(row.amount_refunded ?? 0)) updates.amount_refunded = chainAmountRefunded;
        if (chainCreatedAt && chainCreatedAt !== Number(row.created_at_block ?? 0)) updates.created_at_block = chainCreatedAt;
        if (expiresAt !== Number(row.expires_at_block ?? 0)) updates.expires_at_block = expiresAt;
        if (chainPayer !== row.payer) updates.payer = chainPayer;
        if (chainMerchant && chainMerchant !== row.merchant_principal) updates.merchant_principal = chainMerchant;

        if (Object.keys(updates).length > 0) {
          const { error } = await supabase.from("invoices").update(updates).eq("id", invoiceId);
          if (error) console.error(`invoice ${invoiceId} update error:`, error);
          else corrected++;
        }
      }),
    );
    results.forEach((r, idx) => {
      if (r.status === "rejected") console.warn(`invoice reconcile failed for #${batchIds[idx]}:`, r.reason);
    });
  }

  return { total: totalInvoices, corrected };
}

/** 4. Reconcile subscriptions — iterate 1..totalSubscriptions from chain */
async function reconcileSubscriptions(
  totalSubscriptions: number,
): Promise<{ total: number; corrected: number }> {
  if (totalSubscriptions === 0) return { total: 0, corrected: 0 };

  let corrected = 0;
  const BATCH = 5;

  for (let i = 1; i <= totalSubscriptions; i += BATCH) {
    const batchIds = Array.from({ length: Math.min(BATCH, totalSubscriptions - i + 1) }, (_, k) => i + k);
    const results = await Promise.allSettled(
      batchIds.map(async (subId) => {
        const chain = await callReadOnly("get-subscription", [Cl.uint(subId)]);
        if (!chain) return;

        const chainStatus = Number(chain.status ?? 0);
        const chainPaymentsMade = Number(chain["payments-made"] ?? 0);
        const chainTotalPaid = Number(chain["total-paid"] ?? 0);
        const chainNextPayment = Number(chain["next-payment-at"] ?? 0);
        const chainLastPayment = Number(chain["last-payment-at"] ?? 0);
        const chainSubscriber = String(chain.subscriber ?? "");
        const chainMerchant = String(chain.merchant ?? "");

        const { data: row } = await supabase
          .from("subscriptions")
          .select("id, status, payments_made, total_paid, next_payment_at_block, last_payment_at_block")
          .eq("id", subId)
          .single();

        if (!row) {
          // Missing from Supabase — insert
          const { data: merchant } = await supabase
            .from("merchants")
            .select("id")
            .eq("principal", chainMerchant)
            .single();

          await supabase.from("subscriptions").upsert(
            {
              id: subId,
              merchant_id: merchant?.id ?? null,
              merchant_principal: chainMerchant,
              subscriber: chainSubscriber,
              name: chain.name ? String(chain.name) : "",
              amount: Number(chain.amount ?? 0),
              interval_blocks: Number(chain["interval-blocks"] ?? 0),
              status: chainStatus,
              payments_made: chainPaymentsMade,
              total_paid: chainTotalPaid,
              created_at_block: Number(chain["created-at"] ?? 0),
              next_payment_at_block: chainNextPayment,
              last_payment_at_block: chainLastPayment,
              token_type: Number(chain["token-type"] ?? 0) === 1 ? "stx" : "sbtc",
            },
            { onConflict: "id" },
          );
          corrected++;
          return;
        }

        const updates: Record<string, unknown> = {};
        if (chainStatus !== row.status) updates.status = chainStatus;
        if (chainPaymentsMade !== (row.payments_made ?? 0)) updates.payments_made = chainPaymentsMade;
        if (chainTotalPaid !== Number(row.total_paid ?? 0)) updates.total_paid = chainTotalPaid;
        if (chainNextPayment !== Number(row.next_payment_at_block ?? 0)) updates.next_payment_at_block = chainNextPayment;
        if (chainLastPayment !== Number(row.last_payment_at_block ?? 0)) updates.last_payment_at_block = chainLastPayment;

        if (Object.keys(updates).length > 0) {
          const { error } = await supabase.from("subscriptions").update(updates).eq("id", subId);
          if (error) console.error(`subscription ${subId} update error:`, error);
          else corrected++;
        }
      }),
    );
    results.forEach((r, idx) => {
      if (r.status === "rejected") console.warn(`subscription reconcile failed for #${batchIds[idx]}:`, r.reason);
    });
  }

  return { total: totalSubscriptions, corrected };
}

// ---------- MAIN ----------

Deno.serve(async (req: Request) => {
  // Auth check
  if (RECONCILE_SECRET) {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (!timingSafeEqual(token, RECONCILE_SECRET)) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // Accept both GET (cron-friendly) and POST
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Debug mode: ?debug=invoice&id=10 returns raw chain data
  const url = new URL(req.url);
  if (url.searchParams.get("debug") === "invoice") {
    const id = Number(url.searchParams.get("id") ?? 10);
    try {
      const rawResult = await fetchCallReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: "get-invoice",
        functionArgs: [Cl.uint(id)],
        network: NETWORK,
        senderAddress: SENDER_ADDRESS,
      });
      const json = cvToJSON(rawResult);
      const flat = flattenCvJson(json);
      const chain = await callReadOnly("get-invoice", [Cl.uint(id)]);
      const { data: row } = await supabase
        .from("invoices")
        .select("id, status, amount, amount_paid, expires_at_block, payer")
        .eq("id", id)
        .single();
      const burnHeight = await fetchBurnBlockHeight().catch(() => 0);
      return new Response(JSON.stringify({ rawJsonType: json?.type, flat, flatType: typeof flat, chain, supabase: row, burnHeight }, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
  }

  const start = Date.now();

  try {
    // Step 1: Read on-chain platform stats (gives us totals to iterate)
    const chainStats = await callReadOnly("get-platform-stats", []);
    if (!chainStats) {
      return new Response(
        JSON.stringify({ error: "Failed to read platform stats from chain" }),
        { status: 502, headers: { "Content-Type": "application/json" } },
      );
    }

    const totalInvoices = Number(chainStats["total-invoices"] ?? 0);
    const totalSubscriptions = Number(chainStats["total-subscriptions"] ?? 0);

    // Step 2: Fetch burn block height for expiration checks
    const burnHeight = await fetchBurnBlockHeight().catch(() => 0);

    // Step 3: Run all reconciliation in parallel
    const [statsOk, merchants, invoices, subscriptions] = await Promise.all([
      reconcilePlatformStats(chainStats),
      reconcileMerchants(),
      reconcileInvoices(totalInvoices, burnHeight),
      reconcileSubscriptions(totalSubscriptions),
    ]);

    const result: ReconcileResult = {
      platformStats: statsOk,
      merchants,
      invoices,
      subscriptions,
      burnBlockHeight: burnHeight,
      durationMs: Date.now() - start,
    };

    const totalCorrected = merchants.corrected + invoices.corrected + subscriptions.corrected;
    console.log(
      `Reconciliation complete in ${result.durationMs}ms — ` +
      `${totalCorrected} corrections (merchants: ${merchants.corrected}/${merchants.total}, ` +
      `invoices: ${invoices.corrected}/${invoices.total}, ` +
      `subscriptions: ${subscriptions.corrected}/${subscriptions.total})`,
    );

    // Log reconciliation run
    try {
      await supabase.from("events").insert({
        event_type: "reconciliation",
        tx_id: `reconcile-${Date.now()}`,
        block_height: burnHeight,
        block_hash: "",
        contract_identifier: CONTRACT_ID,
        payload: result,
      });
    } catch { /* non-critical */ }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Reconciliation error:", error);
    return new Response(
      JSON.stringify({ error: "Reconciliation failed", detail: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
