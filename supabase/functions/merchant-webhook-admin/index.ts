// Merchant Webhook Admin
//
// Authenticated endpoint for merchants to manage their outbound webhook setup.
// Auth: Supabase JWT (issued by the wallet-auth function). `sub` claim is the
// caller's Stacks principal; we only allow actions on their own merchant row.
//
// Actions (POST):
//   { action: "regenerate-secret" }
//     → generates a fresh HMAC secret, stores it, returns plaintext ONCE.
//
//   { action: "send-test" }
//     → inserts a test delivery row and fires the sender.
//
//   { action: "get-deliveries" }
//     → returns the caller's last 50 delivery rows (diagnostic view).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_TOKEN = Deno.env.get("INTERNAL_WEBHOOK_TOKEN") ?? SERVICE_ROLE;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// Decode the JWT without verifying the signature (we trust the Authorization
// header was validated by Supabase gateway using project JWT secret). Extract
// the Stacks principal from the `sub` claim.
function decodeJwtSub(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson) as { sub?: string };
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

function randomSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return "whsec_" + Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function regenerateSecret(merchantPrincipal: string): Promise<Response> {
  const secret = randomSecret();
  const { error } = await admin
    .from("merchants")
    .update({ webhook_secret: secret })
    .eq("principal", merchantPrincipal);
  if (error) return json({ error: error.message }, 500);
  return json({ secret }, 200);
}

async function sendTest(merchantPrincipal: string): Promise<Response> {
  const { data: merchant } = await admin
    .from("merchants")
    .select("id, principal, webhook_url")
    .eq("principal", merchantPrincipal)
    .maybeSingle();
  if (!merchant) return json({ error: "Merchant not found" }, 404);
  if (!merchant.webhook_url) {
    return json({ error: "No webhook URL configured. Set one in Profile Details first." }, 400);
  }

  const senderUrl = `${SUPABASE_URL}/functions/v1/merchant-webhook-sender`;
  const resp = await fetch(senderUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${INTERNAL_TOKEN}`,
    },
    body: JSON.stringify({
      merchantPrincipal,
      eventType: "test.ping",
      data: {
        message: "This is a test event from your sBTC Pay dashboard.",
        sent_at: new Date().toISOString(),
      },
      txId: `test_${Date.now()}`,
      blockHeight: null,
      testMode: true,
    }),
  });
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    return json({ error: (body as { error?: string }).error ?? "Test send failed" }, 500);
  }
  return json({ ok: true, delivery: body }, 200);
}

async function getDeliveries(merchantPrincipal: string): Promise<Response> {
  const { data, error } = await admin
    .from("webhook_deliveries")
    .select("id, event_type, tx_id, status, attempts, last_status_code, last_error, last_attempted_at, delivered_at, created_at")
    .eq("merchant_principal", merchantPrincipal)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return json({ error: error.message }, 500);
  return json({ deliveries: data ?? [] }, 200);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS_HEADERS });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const merchantPrincipal = decodeJwtSub(req.headers.get("authorization"));
  if (!merchantPrincipal) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const action = (body as { action?: string } | null)?.action;
  if (!action) return json({ error: "action is required" }, 400);

  switch (action) {
    case "regenerate-secret":
      return await regenerateSecret(merchantPrincipal);
    case "send-test":
      return await sendTest(merchantPrincipal);
    case "get-deliveries":
      return await getDeliveries(merchantPrincipal);
    default:
      return json({ error: `Unknown action: ${action}` }, 400);
  }
});
