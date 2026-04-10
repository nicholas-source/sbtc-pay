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
  "STR54P37AA27XHMMTCDEW4YZFPFJX69160WQESWR.payment-v4";

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
  if (t === "none" || t?.includes("none")) return null;
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
      created_at_block: data["block-height"] ?? blockHeight,
      expires_at_block: data["expires-at"],
      status: 0,
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

  // Update merchant stats
  await supabase.rpc("increment_merchant_received", {
    p_principal: data.merchant,
    p_amount: data["merchant-received"] ?? 0,
  }).catch(() => {});

  // Update platform stats
  await supabase
    .from("platform_stats")
    .update({
      total_volume: (
        await supabase.from("platform_stats").select("total_volume").eq(
          "id",
          1,
        ).single()
      ).data?.total_volume +
        (data.amount as number),
      total_fees_collected: (
        await supabase
          .from("platform_stats")
          .select("total_fees_collected")
          .eq("id", 1)
          .single()
      ).data?.total_fees_collected +
        ((data.fee as number) ?? 0),
    })
    .eq("id", 1);
}

async function handleDirectPayment(
  data: Record<string, unknown>,
  txId: string,
  blockHeight: number,
) {
  await supabase.from("direct_payments").insert({
    payer: data.payer,
    merchant_principal: data.merchant,
    amount: data.amount,
    fee: data.fee ?? 0,
    merchant_received: data["merchant-received"] ?? 0,
    memo: data.memo ?? "",
    block_height: data["block-height"] ?? blockHeight,
    tx_id: txId,
  });
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
    },
    { onConflict: "id" },
  );

  // Update invoice
  const invoiceId = data["invoice-id"] as number;
  const { data: invoice } = await supabase
    .from("invoices")
    .select("amount_refunded")
    .eq("id", invoiceId)
    .single();

  if (invoice) {
    await supabase
      .from("invoices")
      .update({
        amount_refunded: (invoice.amount_refunded ?? 0) +
          (data.amount as number),
        status: 5,
        refunded_at_block: data["block-height"] ?? blockHeight,
      })
      .eq("id", invoiceId);
  }

  // Update platform refund stat
  await supabase
    .from("platform_stats")
    .update({
      total_refunds: (
        await supabase.from("platform_stats").select("total_refunds").eq(
          "id",
          1,
        ).single()
      ).data?.total_refunds +
        (data.amount as number),
    })
    .eq("id", 1);
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
  });

  // Update subscription state
  await supabase
    .from("subscriptions")
    .update({
      payments_made: data["payments-made"],
      total_paid: (
        await supabase.from("subscriptions").select("total_paid").eq(
          "id",
          subId,
        ).single()
      ).data?.total_paid +
        (data.amount as number),
      last_payment_at_block: data["block-height"] ?? blockHeight,
      next_payment_at_block: data["next-payment-at"] ?? blockHeight,
    })
    .eq("id", subId);
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

          // Log every event
          await supabase.from("events").upsert({
            event_type: eventType,
            tx_id: txId,
            block_height: blockHeight,
            block_hash: blockHash,
            contract_identifier: CONTRACT_ID,
            payload: data,
          }, { onConflict: "tx_id,event_type", ignoreDuplicates: true });

          // Process specific event
          if (handler) {
            try {
              await handler(data, txId, blockHeight);
            } catch (handlerError) {
              console.error(
                `Handler error for ${eventType}:`,
                handlerError,
              );
            }
          } else {
            console.log(`No handler for event: ${eventType}`);
          }
        }
      }
    }

    // Handle rollbacks (mark events as rolled back)
    for (const block of rollbackBlocks) {
      const blockHeight = block.block_identifier.index;
      console.warn(`Rollback detected at block ${blockHeight}`);
      // For now, log it. Full rollback support can be added later.
      await supabase.from("events").insert({
        event_type: "rollback",
        tx_id: "rollback",
        block_height: blockHeight,
        block_hash: block.block_identifier.hash,
        contract_identifier: CONTRACT_ID,
        payload: { type: "rollback", block_height: blockHeight },
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
