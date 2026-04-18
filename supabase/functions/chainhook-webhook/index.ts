// Chainhook v2 Webhook — receives Stacks contract events and indexes them into Supabase
// Payload format: https://docs.hiro.so/tools/chainhooks/reference/payload-anatomy
// This function runs with service_role privileges (bypasses RLS)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deserializeCV, cvToJSON, Cl, fetchCallReadOnlyFunction } from "https://esm.sh/@stacks/transactions@7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CHAINHOOK_AUTH_TOKEN = Deno.env.get("CHAINHOOK_AUTH_TOKEN") ?? "";

// Timing-safe string comparison to prevent timing attacks on auth token
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  // Constant-time comparison: always iterates full length
  let mismatch = 0;
  for (let i = 0; i < bufA.length; i++) {
    mismatch |= bufA[i] ^ bufB[i];
  }
  return mismatch === 0;
}

// Expected contract identifier (testnet)
const CONTRACT_ID =
  "STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR.payment-v6";

// Convert contract token-type (u0=sBTC, u1=STX) to DB string
function resolveTokenType(data: Record<string, unknown>): string {
  const tt = data["token-type"];
  if (tt === 1 || tt === "1") return "stx";
  return "sbtc"; // default
}

const [CONTRACT_ADDRESS, CONTRACT_NAME] = CONTRACT_ID.split(".");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// =============================================
// Chainhook v2 Payload Types
// =============================================

interface ChainhookV2Payload {
  event: {
    apply: ChainhookBlock[];
    rollback: ChainhookBlock[];
    chain: string;
    network: string;
  };
  chainhook: {
    name: string;
    uuid: string;
  };
}

interface ChainhookBlock {
  timestamp: number;
  block_identifier: { hash: string; index: number };
  parent_block_identifier: { hash: string; index: number };
  transactions: ChainhookTransaction[];
}

interface ChainhookTransaction {
  transaction_identifier: { hash: string };
  metadata: {
    type: string;
    nonce: number;
    result: { hex: string; repr: string };
    status: string;
    fee_rate: string;
    sender_address: string;
  };
  operations: ChainhookOperation[];
}

interface ChainhookOperation {
  type: string;
  status: string;
  metadata?: {
    topic?: string;
    value?: string; // hex-encoded Clarity value
    contract_identifier?: string;
  };
  operation_identifier: { index: number };
}

// Parse Clarity values from Chainhook event payload
// Handles both v2 decoded values (with decode_clarity_values: true)
// and legacy v1 Clarity object format for backward compatibility
function parseClarity(val: unknown): unknown {
  if (val === null || val === undefined) return null;
  if (typeof val !== "object") return val;

  const v = val as Record<string, unknown>;

  // Clarity value types from Chainhook
  if ("UInt" in v) return Number(v.UInt);
  if ("Int" in v) return Number(v.Int);
  if ("Bool" in v) return v.Bool;
  if ("Principal" in v) return String(v.Principal);
  if ("Ascii" in v) return String(v.Ascii);
  if ("Utf8" in v) return String(v.Utf8);
  if ("Optional" in v) {
    const opt = v.Optional as Record<string, unknown>;
    if ("Some" in opt) return parseClarity(opt.Some);
    return null;
  }
  if ("Tuple" in v) {
    const tuple = v.Tuple as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(tuple)) {
      result[key] = parseClarity(value);
    }
    return result;
  }
  if ("List" in v) {
    return (v.List as unknown[]).map(parseClarity);
  }

  // Fallback: try to parse nested objects
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(v)) {
    result[key] = parseClarity(value);
  }
  return result;
}

// Decode a hex-encoded Clarity value using @stacks/transactions deserializer.
// Returns a plain JS object with the Clarity value converted to JSON.
function decodeClarityValue(hex: string): unknown {
  try {
    const cv = deserializeCV(hex);
    const json = cvToJSON(cv);
    return flattenCvJson(json);
  } catch (e) {
    console.warn("Failed to deserialize Clarity hex:", hex.slice(0, 60), e);
    // Fallback: try UTF-8 JSON decode (for simple print strings)
    try {
      const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
      const bytes = new Uint8Array(
        clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)),
      );
      const text = new TextDecoder().decode(bytes);
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
}

// Flatten cvToJSON output into simple key/value pairs.
// cvToJSON returns { type: "tuple", value: { key: { type: "uint128", value: "25000" }, ... } }
// We want: { key: 25000, ... }
// deno-lint-ignore no-explicit-any
function flattenCvJson(cv: any): unknown {
  if (cv === null || cv === undefined) return null;
  if (typeof cv !== "object") return cv;

  const t = cv.type as string;
  const v = cv.value;

  // Primitive types
  if (t === "uint" || t === "uint128" || t === "int" || t === "int128") return Number(v);
  if (t === "bool") return v;
  if (t === "principal") return v;
  if (t?.startsWith("(string-ascii") || t?.startsWith("(string-utf8")) return v;
  if (t?.startsWith("buff") || t?.startsWith("(buff")) return v;

  // Optional types
  if (t === "none") return null;
  if (t?.startsWith("(optional") || t?.startsWith("(some")) {
    if (v === null || v === undefined) return null;
    return flattenCvJson(v);
  }

  // Response types
  if (t?.startsWith("(response") || t?.startsWith("(ok") || t?.startsWith("(err")) {
    return flattenCvJson(v);
  }

  // Tuple types: "(tuple (field1 type1) (field2 type2) ...)"
  if (t?.startsWith("(tuple") && typeof v === "object" && v !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(v)) {
      result[key] = flattenCvJson(val);
    }
    return result;
  }

  // List types: "(list N type)"
  if (t?.startsWith("(list") && Array.isArray(v)) {
    return v.map(flattenCvJson);
  }

  // Fallback: if has value property, try to flatten it
  if (v !== undefined) return flattenCvJson(v);
  return cv;
}

// Extract event data from a v2 contract_log operation
function extractEventData(
  operation: ChainhookOperation,
): Record<string, unknown> | null {
  if (operation.type !== "contract_log") return null;
  if (operation.status !== "success") return null;

  const meta = operation.metadata;
  if (!meta) return null;
  if (meta.contract_identifier && meta.contract_identifier !== CONTRACT_ID) {
    return null;
  }

  // deno-lint-ignore no-explicit-any
  const rawValue = (meta as any).value;
  if (rawValue === undefined || rawValue === null) return null;

  // Case 1: value is an object with hex field (v2 with decode_clarity_values: true)
  // Real payload format: { hex: "0x0c000000...", repr: "(tuple ...)" }
  if (typeof rawValue === "object" && rawValue.hex) {
    const decoded = decodeClarityValue(rawValue.hex);
    if (decoded && typeof decoded === "object") {
      return decoded as Record<string, unknown>;
    }
  }

  // Case 2: value is already a decoded Clarity object (e.g. { Tuple: { ... } })
  if (typeof rawValue === "object") {
    const parsed = parseClarity(rawValue);
    if (parsed && typeof parsed === "object") {
      return parsed as Record<string, unknown>;
    }
    return rawValue as Record<string, unknown>;
  }

  // Case 2: value is a string
  if (typeof rawValue === "string") {
    // 2a: Try parsing as JSON directly (Chainhook v2 decoded values or plain JSON print)
    try {
      const jsonParsed = JSON.parse(rawValue);
      if (jsonParsed && typeof jsonParsed === "object") {
        return jsonParsed as Record<string, unknown>;
      }
    } catch {
      // Not JSON, continue
    }

    // 2b: Try as hex-encoded Clarity value
    if (rawValue.startsWith("0x") || /^[0-9a-fA-F]+$/.test(rawValue)) {
      const decoded = decodeClarityValue(rawValue);
      if (decoded && typeof decoded === "object") {
        return decoded as Record<string, unknown>;
      }
    }

    // 2c: Try as Clarity repr string (e.g. "(tuple (event \"...\"))")
    // For now, log and skip
    console.warn("Could not parse contract_log value:", rawValue.slice(0, 100));
  }

  return null;
}

// =============================================
// EVENT HANDLERS
// =============================================

async function handleMerchantRegistered(
  data: Record<string, unknown>,
  txId: string,
  blockHeight: number,
) {
  const { error } = await supabase.from("merchants").upsert(
    {
      id: data.id,
      principal: data.merchant,
      name: data.name,
      registered_at: data["block-height"] ?? blockHeight,
      is_active: true,
      is_verified: false,
    },
    { onConflict: "id" },
  );
  if (error) console.error("merchant insert error:", error);

  await supabase.rpc("increment_platform_stat", {
    stat_name: "total_merchants",
    increment_by: 1,
  }).then(({ error }) => {
    if (error) console.error("increment_platform_stat error:", error);
  });
}

async function handleMerchantUpdated(
  data: Record<string, unknown>,
  _txId: string,
) {
  const merchantPrincipal = data.merchant as string;
  if (!merchantPrincipal) return;

  // The contract's merchant-updated event only emits { event, merchant } without
  // updated field values. Read the current on-chain state to get the fresh data.
  const updates: Record<string, unknown> = {};

  // Try fields from event data first (in case a future contract version includes them)
  if (data.name) updates.name = data.name;
  if (data.description !== undefined) updates.description = data.description;
  if (data["webhook-url"] !== undefined) updates.webhook_url = data["webhook-url"];
  if (data["logo-url"] !== undefined) updates.logo_url = data["logo-url"];

  // If event lacked field data, read on-chain
  if (Object.keys(updates).length === 0) {
    try {
      const result = await fetchCallReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: "get-merchant",
        functionArgs: [Cl.principal(merchantPrincipal)],
        network: "testnet",
        senderAddress: merchantPrincipal,
      });
      const json = cvToJSON(result);
      const flat = flattenCvJson(json) as Record<string, unknown> | null;
      if (flat) {
        if (flat.name) updates.name = flat.name;
        if (flat.description !== undefined) updates.description = flat.description;
        if (flat["webhook-url"] !== undefined) updates.webhook_url = flat["webhook-url"];
        if (flat["logo-url"] !== undefined) updates.logo_url = flat["logo-url"];
      }
    } catch (e) {
      console.warn("Failed to read on-chain merchant for update:", e);
    }
  }

  if (Object.keys(updates).length > 0) {
    await supabase
      .from("merchants")
      .update(updates)
      .eq("principal", merchantPrincipal);
  }
}

async function handleMerchantDeactivated(data: Record<string, unknown>) {
  await supabase
    .from("merchants")
    .update({ is_active: false })
    .eq("principal", data.merchant);
}

async function handleMerchantReactivated(data: Record<string, unknown>) {
  await supabase
    .from("merchants")
    .update({ is_active: true })
    .eq("principal", data.merchant);
}

async function handleMerchantVerified(data: Record<string, unknown>) {
  await supabase
    .from("merchants")
    .update({ is_verified: true })
    .eq("principal", data.merchant);
}

async function handleMerchantSuspended(data: Record<string, unknown>) {
  await supabase
    .from("merchants")
    .update({ is_active: false })
    .eq("principal", data.merchant);
}

async function handleInvoiceCreated(
  data: Record<string, unknown>,
  txId: string,
  blockHeight: number,
) {
  // Look up the merchant id
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("principal", data.merchant)
    .single();

  if (!merchant) {
    console.error("merchant not found for invoice:", data.merchant);
    return;
  }

  const { error } = await supabase.from("invoices").upsert(
    {
      id: data["invoice-id"],
      merchant_id: merchant.id,
      merchant_principal: data.merchant,
      amount: data.amount,
      memo: data.memo ?? "",
      reference_id: data["reference-id"] ?? null,
      allow_partial: data["allow-partial"] ?? false,
      allow_overpay: data["allow-overpay"] ?? false,
      created_at_block: data["block-height"] ?? blockHeight,
      expires_at_block: data["expires-at"],
      status: 0,
      token_type: resolveTokenType(data),
    },
    { onConflict: "id" },
  );
  if (error) console.error("invoice insert error:", error);

  // Update platform stats
  await supabase
    .from("platform_stats")
    .update({
      total_invoices: (
        await supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
      ).count ?? 0,
    })
    .eq("id", 1);
}

async function handlePaymentReceived(
  data: Record<string, unknown>,
  txId: string,
  blockHeight: number,
) {
  const invoiceId = data["invoice-id"] as number;

  // Get current payment count for this invoice
  const { count } = await supabase
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("invoice_id", invoiceId);

  const paymentIndex = (count ?? 0);

  const tokenType = resolveTokenType(data);

  // Insert payment record
  const { error: paymentError } = await supabase.from("payments").insert({
    invoice_id: invoiceId,
    payment_index: paymentIndex,
    payer: data.payer,
    merchant_principal: data.merchant,
    amount: data.amount,
    fee: data.fee ?? 0,
    merchant_received: data["merchant-received"] ?? 0,
    block_height: data["block-height"] ?? blockHeight,
    tx_id: txId,
    token_type: tokenType,
  });
  if (paymentError) console.error("payment insert error:", paymentError);

  // Update invoice status
  const { error: invoiceError } = await supabase
    .from("invoices")
    .update({
      amount_paid: data["total-paid"],
      status: data.status,
      payer: data.payer,
      paid_at_block:
        (data.status as number) === 2
          ? (data["block-height"] ?? blockHeight)
          : null,
    })
    .eq("id", invoiceId);
  if (invoiceError) console.error("invoice update error:", invoiceError);

  // Update merchant stats (per-token)
  const merchantRecv = (data["merchant-received"] ?? 0) as number;
  if (tokenType === "stx") {
    await supabase.rpc("increment_merchant_received", {
      p_principal: data.merchant,
      p_amount: merchantRecv,
      p_token: "stx",
    }).catch(() => {
      // Fallback: direct update if RPC not updated yet
      supabase.from("merchants").select("total_received_stx").eq("principal", data.merchant).single().then(({ data: m }) => {
        if (m) supabase.from("merchants").update({ total_received_stx: (m.total_received_stx ?? 0) + merchantRecv }).eq("principal", data.merchant);
      });
    });
  } else {
    await supabase.rpc("increment_merchant_received", {
      p_principal: data.merchant,
      p_amount: merchantRecv,
    }).catch(() => {});
  }

  // Update platform stats (per-token) — atomic increment avoids read-then-write race
  const amt = data.amount as number;
  const fee = (data.fee as number) ?? 0;
  const volCol = tokenType === "stx" ? "total_volume_stx" : "total_volume_sbtc";
  const feeCol = tokenType === "stx" ? "total_fees_stx" : "total_fees_sbtc";
  await supabase.rpc("increment_platform_stats", {
    p_vol_col: volCol,
    p_vol_amount: amt,
    p_fee_col: feeCol,
    p_fee_amount: fee,
  }).catch(async () => {
    // Fallback: read-then-write if RPC not deployed yet
    const { data: stats } = await supabase.from("platform_stats").select(`${volCol}, ${feeCol}`).eq("id", 1).single();
    if (stats) {
      await supabase.from("platform_stats").update({
        [volCol]: (stats[volCol] ?? 0) + amt,
        [feeCol]: (stats[feeCol] ?? 0) + fee,
      }).eq("id", 1);
    }
  });
}

async function handleDirectPayment(
  data: Record<string, unknown>,
  txId: string,
  blockHeight: number,
) {
  const tokenType = resolveTokenType(data);

  await supabase.from("direct_payments").insert({
    payer: data.payer,
    merchant_principal: data.merchant,
    amount: data.amount,
    fee: data.fee ?? 0,
    merchant_received: data["merchant-received"] ?? 0,
    memo: data.memo ?? "",
    block_height: data["block-height"] ?? blockHeight,
    tx_id: txId,
    token_type: tokenType,
  });

  // Update merchant total received (per-token) — atomic increment
  const merchantRecv = (data["merchant-received"] ?? 0) as number;
  await supabase.rpc("increment_merchant_received", {
    p_principal: data.merchant,
    p_amount: merchantRecv,
    p_token: tokenType,
  }).catch(async () => {
    const recvCol = tokenType === "stx" ? "total_received_stx" : "total_received_sbtc";
    const { data: merchant } = await supabase.from("merchants").select(recvCol).eq("principal", data.merchant).single();
    if (merchant) {
      await supabase.from("merchants").update({
        [recvCol]: (merchant[recvCol] ?? 0) + merchantRecv,
      }).eq("principal", data.merchant);
    }
  });

  // Update platform stats (per-token volume + fees) — atomic increment
  const amt = data.amount as number;
  const fee = (data.fee as number) ?? 0;
  const volCol = tokenType === "stx" ? "total_volume_stx" : "total_volume_sbtc";
  const feeCol = tokenType === "stx" ? "total_fees_stx" : "total_fees_sbtc";
  await supabase.rpc("increment_platform_stats", {
    p_vol_col: volCol,
    p_vol_amount: amt,
    p_fee_col: feeCol,
    p_fee_amount: fee,
  }).catch(async () => {
    const { data: stats } = await supabase.from("platform_stats").select(`${volCol}, ${feeCol}`).eq("id", 1).single();
    if (stats) {
      await supabase.from("platform_stats").update({
        [volCol]: (stats[volCol] ?? 0) + amt,
        [feeCol]: (stats[feeCol] ?? 0) + fee,
      }).eq("id", 1);
    }
  });
}

async function handleInvoiceUpdated(
  data: Record<string, unknown>,
  _txId: string,
  _blockHeight: number,
) {
  const invoiceId = data["invoice-id"] as number;
  const updates: Record<string, unknown> = {};

  if (data["new-amount"] !== undefined) updates.amount = data["new-amount"];
  if (data["new-memo"] !== undefined) updates.memo = data["new-memo"];

  // The contract recomputes expires_at from burn-block-height + new-expires-in-blocks,
  // but the event only emits invoice-id, new-amount, new-memo. Read on-chain for
  // the authoritative expires_at value.
  try {
    // Look up the merchant for this invoice to call read-only
    const { data: invoiceRow } = await supabase
      .from("invoices")
      .select("merchant_principal")
      .eq("id", invoiceId)
      .single();

    if (invoiceRow?.merchant_principal) {
      const result = await fetchCallReadOnlyFunction({
        contractAddress: CONTRACT_ADDRESS,
        contractName: CONTRACT_NAME,
        functionName: "get-invoice",
        functionArgs: [Cl.uint(invoiceId)],
        network: "testnet",
        senderAddress: invoiceRow.merchant_principal,
      });
      const json = cvToJSON(result);
      const flat = flattenCvJson(json) as Record<string, unknown> | null;
      if (flat && flat["expires-at"] !== undefined) {
        updates.expires_at_block = flat["expires-at"];
      }
    }
  } catch (e) {
    console.warn("Failed to read on-chain invoice for update:", e);
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("invoices")
      .update(updates)
      .eq("id", invoiceId);
    if (error) console.error("invoice update error:", error);
  }
}

async function handleInvoiceExpired(
  data: Record<string, unknown>,
  _txId: string,
  blockHeight: number,
) {
  const invoiceId = data["invoice-id"] as number;
  const { error } = await supabase
    .from("invoices")
    .update({
      status: 3, // STATUS_EXPIRED
      expired_at_block: data["block-height"] ?? blockHeight,
    })
    .eq("id", invoiceId);
  if (error) console.error("invoice expire error:", error);
}

async function handleInvoiceCancelled(data: Record<string, unknown>) {
  await supabase
    .from("invoices")
    .update({ status: 4 })
    .eq("id", data["invoice-id"]);
}

async function handleRefundProcessed(
  data: Record<string, unknown>,
  txId: string,
  blockHeight: number,
) {
  const tokenType = resolveTokenType(data);

  // Insert refund record
  await supabase.from("refunds").upsert(
    {
      id: data["refund-id"],
      invoice_id: data["invoice-id"],
      merchant_principal: data.merchant,
      customer: data.customer,
      amount: data.amount,
      reason: data.reason ?? "",
      processed_at_block: data["block-height"] ?? blockHeight,
      tx_id: txId,
      token_type: tokenType,
    },
    { onConflict: "id" },
  );

  // Update invoice — only set status=5 (refunded) if total refunded >= amount paid
  const invoiceId = data["invoice-id"] as number;
  const { data: invoice } = await supabase
    .from("invoices")
    .select("amount_refunded, amount_paid")
    .eq("id", invoiceId)
    .single();

  if (invoice) {
    const newRefunded = (invoice.amount_refunded ?? 0) + (data.amount as number);
    const amountPaid = invoice.amount_paid ?? 0;
    const updates: Record<string, unknown> = {
      amount_refunded: newRefunded,
      refunded_at_block: data["block-height"] ?? blockHeight,
    };
    // Contract only sets STATUS_REFUNDED when total refunded >= amount paid
    if (newRefunded >= amountPaid) {
      updates.status = 5;
    }
    await supabase
      .from("invoices")
      .update(updates)
      .eq("id", invoiceId);
  }

  // Update platform refund stat (per-token) — atomic increment
  const refundAmt = data.amount as number;
  const refundCol = tokenType === "stx" ? "total_refunds_stx" : "total_refunds_sbtc";
  await supabase.rpc("increment_platform_stats", {
    p_vol_col: refundCol,
    p_vol_amount: refundAmt,
    p_fee_col: refundCol,
    p_fee_amount: 0,
  }).catch(async () => {
    const { data: stats } = await supabase.from("platform_stats").select(refundCol).eq("id", 1).single();
    if (stats) {
      await supabase.from("platform_stats").update({
        [refundCol]: (stats[refundCol] ?? 0) + refundAmt,
      }).eq("id", 1);
    }
  });
}

async function handleSubscriptionCreated(
  data: Record<string, unknown>,
  txId: string,
  blockHeight: number,
) {
  const { data: merchant } = await supabase
    .from("merchants")
    .select("id")
    .eq("principal", data.merchant)
    .single();

  if (!merchant) {
    console.error("merchant not found for subscription:", data.merchant);
    return;
  }

  await supabase.from("subscriptions").upsert(
    {
      id: data["subscription-id"],
      merchant_id: merchant.id,
      merchant_principal: data.merchant,
      subscriber: data.subscriber,
      name: data.name,
      amount: data.amount,
      interval_blocks: data["interval-blocks"],
      status: 0,
      created_at_block: data["block-height"] ?? blockHeight,
      next_payment_at_block: data["block-height"] ?? blockHeight,
      token_type: resolveTokenType(data),
    },
    { onConflict: "id" },
  );

  // Update platform stats
  await supabase
    .from("platform_stats")
    .update({
      total_subscriptions: (
        await supabase
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
      ).count ?? 0,
    })
    .eq("id", 1);
}

async function handleSubscriptionPayment(
  data: Record<string, unknown>,
  txId: string,
  blockHeight: number,
) {
  const subId = data["subscription-id"] as number;
  const tokenType = resolveTokenType(data);

  await supabase.from("subscription_payments").insert({
    subscription_id: subId,
    subscriber: data.subscriber,
    merchant_principal: data.merchant,
    amount: data.amount,
    fee: data.fee ?? 0,
    merchant_received: data["merchant-received"] ?? 0,
    payment_number: data["payments-made"] ?? 0,
    block_height: data["block-height"] ?? blockHeight,
    tx_id: txId,
    token_type: tokenType,
  });

  // Get current subscription to compute next_payment_at
  const { data: sub } = await supabase.from("subscriptions")
    .select("total_paid, interval_blocks")
    .eq("id", subId)
    .single();

  const currentBlock = (data["block-height"] ?? blockHeight) as number;
  const intervalBlocks = sub?.interval_blocks ?? 144;
  const nextPaymentAt = currentBlock + intervalBlocks;

  // Update subscription state
  await supabase
    .from("subscriptions")
    .update({
      payments_made: data["payments-made"],
      total_paid: (sub?.total_paid ?? 0) + (data.amount as number),
      last_payment_at_block: currentBlock,
      next_payment_at_block: nextPaymentAt,
    })
    .eq("id", subId);

  // Update merchant total received (per-token) — atomic increment
  const merchantRecv = (data["merchant-received"] ?? 0) as number;
  await supabase.rpc("increment_merchant_received", {
    p_principal: data.merchant,
    p_amount: merchantRecv,
    p_token: tokenType,
  }).catch(async () => {
    const recvCol = tokenType === "stx" ? "total_received_stx" : "total_received_sbtc";
    const { data: merchant } = await supabase.from("merchants").select(recvCol).eq("principal", data.merchant).single();
    if (merchant) {
      await supabase.from("merchants").update({
        [recvCol]: (merchant[recvCol] ?? 0) + merchantRecv,
      }).eq("principal", data.merchant);
    }
  });

  // Update platform stats (per-token volume + fees) — atomic increment
  const amt = data.amount as number;
  const fee = (data.fee as number) ?? 0;
  const volCol = tokenType === "stx" ? "total_volume_stx" : "total_volume_sbtc";
  const feeCol = tokenType === "stx" ? "total_fees_stx" : "total_fees_sbtc";
  await supabase.rpc("increment_platform_stats", {
    p_vol_col: volCol,
    p_vol_amount: amt,
    p_fee_col: feeCol,
    p_fee_amount: fee,
  }).catch(async () => {
    const { data: stats } = await supabase.from("platform_stats").select(`${volCol}, ${feeCol}`).eq("id", 1).single();
    if (stats) {
      await supabase.from("platform_stats").update({
        [volCol]: (stats[volCol] ?? 0) + amt,
        [feeCol]: (stats[feeCol] ?? 0) + fee,
      }).eq("id", 1);
    }
  });
}

async function handleSubscriptionCancelled(data: Record<string, unknown>) {
  await supabase
    .from("subscriptions")
    .update({ status: 2 })
    .eq("id", data["subscription-id"]);
}

async function handleSubscriptionPaused(data: Record<string, unknown>) {
  await supabase
    .from("subscriptions")
    .update({ status: 1 })
    .eq("id", data["subscription-id"]);
}

async function handleSubscriptionResumed(data: Record<string, unknown>) {
  await supabase
    .from("subscriptions")
    .update({ status: 0 })
    .eq("id", data["subscription-id"]);
}

// =============================================
// MAIN EVENT ROUTER
// =============================================

const EVENT_HANDLERS: Record<
  string,
  (
    data: Record<string, unknown>,
    txId: string,
    blockHeight: number,
  ) => Promise<void>
> = {
  "merchant-registered": handleMerchantRegistered,
  "merchant-updated": handleMerchantUpdated,
  "merchant-deactivated": handleMerchantDeactivated,
  "merchant-reactivated": handleMerchantReactivated,
  "merchant-verified": handleMerchantVerified,
  "merchant-suspended": handleMerchantSuspended,
  "invoice-created": handleInvoiceCreated,
  "invoice-updated": handleInvoiceUpdated,
  "invoice-expired": handleInvoiceExpired,
  "invoice-cancelled": handleInvoiceCancelled,
  "payment-received": handlePaymentReceived,
  "direct-payment": handleDirectPayment,
  "refund-processed": handleRefundProcessed,
  "subscription-created": handleSubscriptionCreated,
  "subscription-payment": handleSubscriptionPayment,
  "subscription-cancelled": handleSubscriptionCancelled,
  "subscription-paused": handleSubscriptionPaused,
  "subscription-resumed": handleSubscriptionResumed,
};

Deno.serve(async (req: Request) => {
  // Only accept POST
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Verify auth token if configured
  // v2 chainhook consumer secrets are sent as Authorization header
  if (CHAINHOOK_AUTH_TOKEN) {
    const authHeader = req.headers.get("authorization") ?? "";
    // Accept both "Bearer <token>" and plain "<token>" formats
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    if (!timingSafeEqual(token, CHAINHOOK_AUTH_TOKEN)) {
      console.error("Auth failed. Header prefix:", authHeader.slice(0, 20) + "...");
      return new Response("Unauthorized", { status: 401 });
    }
  } else {
    console.warn("CHAINHOOK_AUTH_TOKEN not set — webhook is unauthenticated!");
  }

  try {
    const raw = await req.json();

    // Log incoming payload shape for debugging
    const topKeys = Object.keys(raw);
    console.log("Webhook received. Top-level keys:", topKeys.join(", "));

    // v2 payload: { event: { apply, rollback, chain, network }, chainhook: { name, uuid } }
    // v1 payload: { apply, rollback, chainhook: { uuid, predicate } }
    // Hiro Platform also sends: { apply: [...], rollback: [...], chainhook: { ... } }
    // Detect and normalize
    const isV2 = "event" in raw && raw.event?.apply;
    const isV1Direct = !isV2 && Array.isArray(raw.apply);
    const applyBlocks: ChainhookBlock[] = isV2
      ? (raw.event?.apply ?? [])
      : (raw.apply ?? []);
    const rollbackBlocks: ChainhookBlock[] = isV2
      ? (raw.event?.rollback ?? [])
      : (raw.rollback ?? []);

    console.log(`Format: ${isV2 ? "v2" : isV1Direct ? "v1-direct" : "unknown"}, apply blocks: ${applyBlocks.length}, rollback blocks: ${rollbackBlocks.length}`);

    // Process applied blocks
    for (const block of applyBlocks) {
      const blockHeight = block.block_identifier.index;
      const blockHash = block.block_identifier.hash;

      for (const tx of block.transactions) {
        // v2: metadata.status === "success", v1: metadata.success === true
        const isSuccess = isV2
          ? tx.metadata.status === "success"
          : (tx.metadata as unknown as { success: boolean }).success;

        if (!isSuccess) {
          console.log(`Skipping failed tx ${tx.transaction_identifier.hash}`);
          continue;
        }

        const txId = tx.transaction_identifier.hash;

        // v2: operations array, v1: metadata.receipt.events
        // Hiro Platform v1-direct: metadata.receipt.events
        const operations: ChainhookOperation[] = isV2
          ? (tx.operations ?? [])
          : ((tx.metadata as unknown as { receipt: { events: ChainhookOperation[] } })
              .receipt?.events ?? []);

        console.log(`Processing tx ${txId.slice(0, 12)}... ops: ${operations.length}`);

        for (const operation of operations) {
          const data = extractEventData(operation);
          if (!data || !data.event) continue;

          const eventType = data.event as string;
          console.log(`Event: ${eventType} | tx: ${txId.slice(0, 12)}...`);
          const handler = EVENT_HANDLERS[eventType];

          // Log every event (idempotency: skip if already processed)
          const { data: upsertedRow, error: upsertError } = await supabase.from("events").upsert({
            event_type: eventType,
            tx_id: txId,
            block_height: blockHeight,
            block_hash: blockHash,
            contract_identifier: CONTRACT_ID,
            payload: data,
          }, { onConflict: "tx_id,event_type", ignoreDuplicates: true })
            .select("id");

          // If ignoreDuplicates caused a skip, upsertedRow is empty → event was already processed
          if (upsertError) {
            console.error(`Event upsert error for ${eventType}:`, upsertError);
            continue;
          }
          if (!upsertedRow || upsertedRow.length === 0) {
            console.log(`Duplicate event skipped: ${eventType} | tx: ${txId.slice(0, 12)}...`);
            continue;
          }

          // Process specific event
          if (handler) {
            try {
              await handler(data, txId, blockHeight);
            } catch (handlerError) {
              console.error(
                `Handler error for ${eventType}:`,
                handlerError,
              );
              // Return 500 so Chainhook will retry delivery
              return new Response(
                JSON.stringify({ error: `Handler failed for ${eventType}`, detail: String(handlerError) }),
                { status: 500, headers: { "Content-Type": "application/json" } },
              );
            }
          } else {
            console.log(`No handler for event: ${eventType}`);
          }
        }
      }
    }

    // Handle rollbacks — delete events and associated data at rolled-back blocks
    for (const block of rollbackBlocks) {
      const blockHeight = block.block_identifier.index;
      console.warn(`Rollback detected at block ${blockHeight}`);

      // Find all events that were applied at this block height
      const { data: rolledBackEvents } = await supabase
        .from("events")
        .select("event_type, tx_id, payload")
        .eq("block_height", blockHeight);

      if (rolledBackEvents && rolledBackEvents.length > 0) {
        console.warn(`Rolling back ${rolledBackEvents.length} events at block ${blockHeight}`);

        for (const evt of rolledBackEvents) {
          const payload = evt.payload as Record<string, unknown> | null;
          const eventType = evt.event_type;

          // Revert data based on event type
          try {
            if (eventType === "payment-received" && evt.tx_id) {
              // Delete payment record and revert invoice amount_paid
              await supabase.from("payments").delete().eq("tx_id", evt.tx_id);
              // Re-read invoice to recompute amount_paid from remaining payments
              const invoiceId = payload?.["invoice-id"] as number | undefined;
              if (invoiceId) {
                const { data: remaining } = await supabase
                  .from("payments")
                  .select("amount")
                  .eq("invoice_id", invoiceId);
                const totalPaid = (remaining ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
                await supabase.from("invoices").update({
                  amount_paid: totalPaid,
                  status: totalPaid === 0 ? 0 : 1, // pending or partial
                  paid_at_block: null,
                }).eq("id", invoiceId);
              }
            } else if (eventType === "direct-payment" && evt.tx_id) {
              await supabase.from("direct_payments").delete().eq("tx_id", evt.tx_id);
            } else if (eventType === "refund-processed" && payload?.["refund-id"]) {
              await supabase.from("refunds").delete().eq("id", payload["refund-id"]);
              // Re-read invoice to recompute amount_refunded
              const invoiceId = payload?.["invoice-id"] as number | undefined;
              if (invoiceId) {
                const { data: remaining } = await supabase
                  .from("refunds")
                  .select("amount")
                  .eq("invoice_id", invoiceId);
                const totalRefunded = (remaining ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);
                await supabase.from("invoices").update({
                  amount_refunded: totalRefunded,
                }).eq("id", invoiceId);
              }
            } else if (eventType === "invoice-created" && payload?.["invoice-id"]) {
              await supabase.from("invoices").delete().eq("id", payload["invoice-id"]);
            } else if (eventType === "subscription-payment" && evt.tx_id) {
              await supabase.from("subscription_payments").delete().eq("tx_id", evt.tx_id);
            } else if (eventType === "subscription-created" && payload?.["subscription-id"]) {
              await supabase.from("subscriptions").delete().eq("id", payload["subscription-id"]);
            }
          } catch (rollbackErr) {
            console.error(`Rollback revert error for ${eventType}:`, rollbackErr);
          }
        }

        // Delete the rolled-back event records
        await supabase.from("events").delete().eq("block_height", blockHeight);
      }

      // Log rollback occurrence
      await supabase.from("events").insert({
        event_type: "rollback",
        tx_id: `rollback-${blockHeight}`,
        block_height: blockHeight,
        block_hash: block.block_identifier.hash,
        contract_identifier: CONTRACT_ID,
        payload: { type: "rollback", block_height: blockHeight, reverted_count: rolledBackEvents?.length ?? 0 },
      });
    }

    return new Response(JSON.stringify({ status: "ok" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
