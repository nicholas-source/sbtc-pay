// Merchant Webhook Sender
//
// Fires outbound HTTPS POSTs to a merchant's configured webhook URL when a
// contract event is indexed. Signs each request with HMAC-SHA256 so merchants
// can verify authenticity.
//
// Two modes:
//   POST /  with { merchantPrincipal, eventType, data, txId, blockHeight }
//       → enqueues a delivery row and fires it inline (first attempt).
//
//   POST / with { retry: true }  (called by cron)
//       → scans webhook_deliveries for due retries and fires them.
//
// Retry schedule (after the initial attempt):
//   attempt 2: +1 minute
//   attempt 3: +5 minutes
//   attempt 4: +30 minutes
//   attempt 5: +2 hours
//   after 5 attempts: status = 'dead'

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_TOKEN = Deno.env.get("INTERNAL_WEBHOOK_TOKEN") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const MAX_ATTEMPTS = 5;
const HTTP_TIMEOUT_MS = 10_000;

// Delay in seconds between attempts (index = next attempt number)
const BACKOFF_SECONDS = [0, 60, 300, 1_800, 7_200];

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "whsec_" + Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

type DeliveryRow = {
  id: number;
  merchant_id: string;
  merchant_principal: string;
  webhook_url: string;
  event_type: string;
  tx_id: string | null;
  block_height: number | null;
  payload: Record<string, unknown>;
  attempts: number;
};

async function getOrCreateSecret(merchantPrincipal: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("merchants")
    .select("webhook_secret")
    .eq("principal", merchantPrincipal)
    .maybeSingle();

  if (error) {
    console.error("secret lookup failed:", error);
    return null;
  }
  if (data?.webhook_secret) return data.webhook_secret as string;

  // Auto-generate on first use
  const fresh = randomSecret();
  const { error: upErr } = await supabase
    .from("merchants")
    .update({ webhook_secret: fresh })
    .eq("principal", merchantPrincipal);
  if (upErr) {
    console.error("secret write failed:", upErr);
    return null;
  }
  return fresh;
}

async function fireOnce(row: DeliveryRow): Promise<void> {
  const secret = await getOrCreateSecret(row.merchant_principal);
  if (!secret) {
    await supabase.from("webhook_deliveries").update({
      status: "failed",
      last_error: "Missing webhook secret (merchant row not found)",
      last_attempted_at: new Date().toISOString(),
      attempts: row.attempts + 1,
    }).eq("id", row.id);
    return;
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id: `evt_${row.id}`,
    type: row.event_type,
    tx_id: row.tx_id,
    block_height: row.block_height,
    merchant: row.merchant_principal,
    created: timestamp,
    data: row.payload,
  });
  const signedPayload = `${timestamp}.${body}`;
  const signature = await hmacHex(secret, signedPayload);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  let statusCode = 0;
  let errorMessage: string | null = null;

  try {
    const resp = await fetch(row.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "sBTCPay-Webhook/1.0",
        "X-SbtcPay-Event": row.event_type,
        "X-SbtcPay-Signature": `t=${timestamp},v1=${signature}`,
        "X-SbtcPay-Delivery": String(row.id),
      },
      body,
      signal: controller.signal,
    });
    statusCode = resp.status;
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      errorMessage = `HTTP ${resp.status}: ${text.slice(0, 500)}`;
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  } finally {
    clearTimeout(timer);
  }

  const nextAttempts = row.attempts + 1;
  const delivered = statusCode >= 200 && statusCode < 300;
  // 4xx (except 408/429) are permanent — merchant's endpoint rejected the payload.
  const permanent = statusCode >= 400 && statusCode < 500 && statusCode !== 408 && statusCode !== 429;

  if (delivered) {
    await supabase.from("webhook_deliveries").update({
      status: "delivered",
      attempts: nextAttempts,
      last_status_code: statusCode,
      last_error: null,
      last_attempted_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
    }).eq("id", row.id);
    return;
  }

  if (permanent || nextAttempts >= MAX_ATTEMPTS) {
    await supabase.from("webhook_deliveries").update({
      status: "dead",
      attempts: nextAttempts,
      last_status_code: statusCode || null,
      last_error: errorMessage,
      last_attempted_at: new Date().toISOString(),
    }).eq("id", row.id);
    return;
  }

  // Schedule next retry
  const delaySec = BACKOFF_SECONDS[Math.min(nextAttempts, BACKOFF_SECONDS.length - 1)];
  const nextAttemptAt = new Date(Date.now() + delaySec * 1000).toISOString();
  await supabase.from("webhook_deliveries").update({
    status: "pending",
    attempts: nextAttempts,
    last_status_code: statusCode || null,
    last_error: errorMessage,
    last_attempted_at: new Date().toISOString(),
    next_attempt_at: nextAttemptAt,
  }).eq("id", row.id);
}

async function handleEnqueue(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON body" }, 400);

  const {
    merchantPrincipal,
    eventType,
    data,
    txId,
    blockHeight,
    testMode,
  } = body as {
    merchantPrincipal?: string;
    eventType?: string;
    data?: Record<string, unknown>;
    txId?: string | null;
    blockHeight?: number | null;
    testMode?: boolean;
  };

  if (!merchantPrincipal || !eventType) {
    return json({ error: "merchantPrincipal and eventType are required" }, 400);
  }

  // Look up merchant row to get webhook URL and id
  const { data: merchant, error: merchantErr } = await supabase
    .from("merchants")
    .select("id, principal, webhook_url")
    .eq("principal", merchantPrincipal)
    .maybeSingle();

  if (merchantErr || !merchant) {
    return json({ error: "Merchant not found" }, 404);
  }
  if (!merchant.webhook_url) {
    // No webhook URL configured — silently skip (not an error)
    return json({ skipped: true, reason: "no webhook URL configured" }, 200);
  }

  // Insert delivery row (or upsert on idempotency key)
  const { data: inserted, error: insertErr } = await supabase
    .from("webhook_deliveries")
    .upsert({
      merchant_id: String(merchant.id),
      merchant_principal: merchantPrincipal,
      webhook_url: merchant.webhook_url,
      event_type: eventType,
      tx_id: txId ?? null,
      block_height: blockHeight ?? null,
      payload: data ?? {},
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
    }, testMode
      ? { onConflict: "id" } // allow duplicates for test events
      : { onConflict: "merchant_principal,tx_id,event_type", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();

  if (insertErr) {
    console.error("delivery insert failed:", insertErr);
    return json({ error: insertErr.message }, 500);
  }
  if (!inserted) {
    // Duplicate (idempotency) — already queued or delivered
    return json({ skipped: true, reason: "already enqueued" }, 200);
  }

  // Fire immediately (don't wait — return fast so chainhook isn't blocked)
  fireOnce(inserted as DeliveryRow).catch((e) => console.error("fireOnce failed:", e));

  return json({ deliveryId: inserted.id }, 202);
}

async function handleRetry(): Promise<Response> {
  const { data: pending, error } = await supabase
    .from("webhook_deliveries")
    .select("id, merchant_id, merchant_principal, webhook_url, event_type, tx_id, block_height, payload, attempts")
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at", { ascending: true })
    .limit(25);

  if (error) return json({ error: error.message }, 500);
  if (!pending || pending.length === 0) return json({ retried: 0 }, 200);

  for (const row of pending as DeliveryRow[]) {
    try {
      await fireOnce(row);
    } catch (e) {
      console.error(`retry failed for delivery ${row.id}:`, e);
    }
  }
  return json({ retried: pending.length }, 200);
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode");

  // Retry mode just drains the existing pending-deliveries queue — no user input,
  // no way to abuse it beyond making the queue process slightly faster.
  // Skipping auth lets pg_cron tick this every minute without secret-management.
  if (mode === "retry") {
    return await handleRetry();
  }

  // Enqueue mode (chainhook → here, admin → here): require internal token.
  if (INTERNAL_TOKEN) {
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
    const adminToken = SERVICE_ROLE;
    const isInternal = timingSafeEqual(token, INTERNAL_TOKEN);
    const isAdmin = timingSafeEqual(token, adminToken);
    if (!isInternal && !isAdmin) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  return await handleEnqueue(req);
});
