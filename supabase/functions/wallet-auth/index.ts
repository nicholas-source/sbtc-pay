// Wallet-based JWT authentication for sBTC Pay
// Verifies a Stacks wallet signature and issues a Supabase-compatible JWT.
// Flow: client signs a timestamped message → this function verifies → returns JWT.

import { SignJWT } from "https://deno.land/x/jose@v5.2.0/index.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { secp256k1 } from "npm:@noble/curves@1.8.1/secp256k1";
import { sha256 } from "npm:@noble/hashes@1.7.1/sha256";
import { bytesToHex, hexToBytes, concatBytes, utf8ToBytes } from "npm:@noble/hashes@1.7.1/utils";
import { ripemd160 } from "npm:@noble/hashes@1.7.1/ripemd160";
import { c32address } from "npm:c32check@2.0.0";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Max age of signed message before it's rejected (prevents replay). */
const MAX_MESSAGE_AGE_MS = 5 * 60 * 1000; // 5 minutes
const TOKEN_EXPIRY = "24h";
const SIG_HEX_LENGTH = 130; // 65 bytes: r(32) + s(32) + v(1)

// ── Supabase admin client (service-role) for nonce store ───────────────────
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are auto-injected into edge
// functions by the Supabase runtime. The service-role key bypasses RLS so we
// can read/write the used_signatures table; this table is gated by RLS with
// zero policies, so no public role can touch it.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const adminClient = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

// ── Stacks message hashing ──────────────────────────────────────────────────
// Exact replica of @stacks/encryption encodeMessage + hashMessage.
// Source: https://github.com/hirosystems/stacks.js/blob/main/packages/encryption/src/messageSignature.ts
// Key details:
//   1. Prefix byte is \x17 (23) = length of "Stacks Signed Message:\n"
//   2. Message length is Bitcoin-style varint (single byte for len < 253)
//   3. Byte concatenation (not string concatenation)

function varintEncode(n: number): Uint8Array {
  if (n < 0xfd) return new Uint8Array([n]);
  if (n <= 0xffff) {
    const buf = new Uint8Array(3);
    buf[0] = 0xfd;
    buf[1] = n & 0xff;
    buf[2] = (n >> 8) & 0xff;
    return buf;
  }
  const buf = new Uint8Array(5);
  buf[0] = 0xfe;
  buf[1] = n & 0xff;
  buf[2] = (n >> 8) & 0xff;
  buf[3] = (n >> 16) & 0xff;
  buf[4] = (n >> 24) & 0xff;
  return buf;
}

function stacksHashMessage(message: string): Uint8Array {
  const prefix = utf8ToBytes("\x17Stacks Signed Message:\n");
  const messageBytes = utf8ToBytes(message);
  const encodedLength = varintEncode(messageBytes.length);
  return sha256(concatBytes(prefix, encodedLength, messageBytes));
}

// ── Address-based signature verification ────────────────────────────────────
// Instead of trusting the client-sent publicKey (which may differ from the
// wallet's signing key), we RECOVER the public key from the signature,
// derive its STX address, and verify it matches the claimed address.
// This is more secure and eliminates key-mismatch issues.

interface VerifyResult {
  valid: boolean;
  recoveredPubKey?: string;
  debug?: string;
}

function verifySignatureForAddress(
  message: string,
  signatureHex: string,
  claimedAddress: string,
): VerifyResult {
  const cleanSig = signatureHex.startsWith("0x") ? signatureHex.slice(2) : signatureHex;

  if (cleanSig.length !== SIG_HEX_LENGTH) {
    return { valid: false, debug: `bad sig hex length: ${cleanSig.length} (expected ${SIG_HEX_LENGTH})` };
  }

  const isTestnet = claimedAddress.startsWith("ST");

  // Try both hash strategies: string-length (SDK standard) and byte-length (fallback)
  const msgBytes = utf8ToBytes(message);
  const hashes = [
    { name: "strLen", hash: stacksHashMessage(message) },
    ...(message.length !== msgBytes.length
      ? [{
          name: "byteLen",
          hash: sha256(concatBytes(
            // \x17 is the length of "Stacks Signed Message:\n" (23 bytes); this
            // fallback only triggers for non-ASCII messages.
            utf8ToBytes(`\x17Stacks Signed Message:\n${msgBytes.length}`),
            msgBytes,
          )),
        }]
      : []),
  ];

  // Try both byte orders: RSV (Stacks standard) and VRS (some wallets)
  const attempts: string[] = [];

  for (const { name: hashName, hash } of hashes) {
    const orders = [
      {
        name: "RSV",
        r: cleanSig.slice(0, 64),
        s: cleanSig.slice(64, 128),
        v: parseInt(cleanSig.slice(128, 130), 16),
      },
      {
        name: "VRS",
        r: cleanSig.slice(2, 66),
        s: cleanSig.slice(66, 130),
        v: parseInt(cleanSig.slice(0, 2), 16),
      },
    ];

    for (const fmt of orders) {
      // Try both raw recovery ID and BIP-137 offset (v-27)
      const candidates = [fmt.v];
      if (fmt.v >= 27 && fmt.v <= 30) candidates.push(fmt.v - 27);
      if (fmt.v >= 31 && fmt.v <= 34) candidates.push(fmt.v - 31);

      for (const recId of candidates) {
        if (recId < 0 || recId > 3) continue;
        try {
          const sig = new secp256k1.Signature(
            BigInt("0x" + fmt.r),
            BigInt("0x" + fmt.s),
          ).addRecoveryBit(recId);
          const recovered = sig.recoverPublicKey(hash);
          const recoveredHex = recovered.toHex(true); // compressed
          const derivedAddr = pubKeyToStxAddress(recoveredHex, isTestnet);

          if (derivedAddr === claimedAddress) {
            return {
              valid: true,
              recoveredPubKey: recoveredHex,
              debug: `${fmt.name}+${hashName} recId=${recId}`,
            };
          }
          attempts.push(`${fmt.name}+${hashName}(v=${fmt.v},rec=${recId}): ${derivedAddr.slice(0, 8)}≠${claimedAddress.slice(0, 8)}`);
        } catch {
          // Invalid recovery — skip
        }
      }
    }
  }

  return {
    valid: false,
    debug: [
      `addr=${claimedAddress.slice(0, 12)}`,
      `sig=${cleanSig.slice(0, 12)}…${cleanSig.slice(-4)}`,
      `hashHex=${bytesToHex(hashes[0].hash).slice(0, 12)}`,
      ...attempts,
    ].join(" | "),
  };
}

// ── Address derivation from compressed public key ───────────────────────────
function pubKeyToStxAddress(publicKeyHex: string, isTestnet: boolean): string {
  const pubKeyBytes = hexToBytes(publicKeyHex);
  const hash = ripemd160(sha256(pubKeyBytes));
  // c32 version: 22 = mainnet P2PKH (SP...), 26 = testnet P2PKH (ST...)
  const version = isTestnet ? 26 : 22;
  return c32address(version, bytesToHex(hash));
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function isPlausibleStxAddress(addr: string): boolean {
  // Mainnet "SP..." or testnet "ST..." c32-encoded — 28-41 chars typical.
  return /^S[PT][0-9A-HJ-NP-Z]{20,50}$/.test(addr);
}

function isPlausibleSigHex(sig: string): boolean {
  const clean = sig.startsWith("0x") ? sig.slice(2) : sig;
  return clean.length === SIG_HEX_LENGTH && /^[0-9a-fA-F]+$/.test(clean);
}

// ── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    // Note: client may also send a publicKey field, but we ignore it — we
    // recover the pubkey from the signature ourselves (more secure).
    const { message, signature, address } = body as {
      message?: string;
      signature?: string;
      address?: string;
    };

    // 1. Cheap shape checks first — reject obviously malformed requests before
    //    we spend any crypto. Saves CPU under spam / scanning.
    if (!message || !signature || !address) {
      return jsonResponse({ error: "Missing required fields: message, signature, address" }, 400);
    }
    if (typeof message !== "string" || message.length < 16 || message.length > 1024) {
      return jsonResponse({ error: "Invalid message length" }, 400);
    }
    if (!isPlausibleSigHex(signature)) {
      return jsonResponse({ error: "Invalid signature format" }, 400);
    }
    if (!isPlausibleStxAddress(address)) {
      return jsonResponse({ error: "Invalid Stacks address" }, 400);
    }

    // 2. Verify message freshness (prevents replay attacks beyond the window)
    const tsMatch = message.match(/Timestamp: (\d+)/);
    if (!tsMatch) {
      return jsonResponse({ error: "Invalid message format — missing timestamp" }, 400);
    }
    const timestamp = parseInt(tsMatch[1], 10);
    if (isNaN(timestamp) || Math.abs(Date.now() - timestamp) > MAX_MESSAGE_AGE_MS) {
      return jsonResponse({ error: "Message expired. Please sign again." }, 401);
    }

    // 3. Verify the signature was produced by a key that derives to the
    //    claimed address. This is the expensive step.
    const result = verifySignatureForAddress(message, signature, address);
    if (!result.valid) {
      console.warn("[wallet-auth] Verification failed:", result.debug);
      return jsonResponse({ error: "Invalid signature", debug: result.debug }, 401);
    }

    // 4. Replay protection: within the 5-minute window the same signature
    //    could be used multiple times without this step. Record the SHA-256
    //    of the signature in used_signatures (UNIQUE on signature_hash); a
    //    duplicate INSERT means we've seen it before → reject.
    if (adminClient) {
      const cleanSig = signature.startsWith("0x") ? signature.slice(2) : signature;
      const sigHash = bytesToHex(sha256(utf8ToBytes(cleanSig.toLowerCase())));
      const expiresAt = new Date(timestamp + MAX_MESSAGE_AGE_MS).toISOString();
      const { error: insertError } = await adminClient
        .from("used_signatures")
        .insert({ signature_hash: sigHash, expires_at: expiresAt });
      if (insertError) {
        // Postgres unique-violation = signature already used within the window
        if (insertError.code === "23505") {
          return jsonResponse(
            { error: "Signature already used. Please sign a fresh message." },
            401,
          );
        }
        // Some other DB error — fail closed: better to block than to silently
        // allow replays.
        console.error("[wallet-auth] Nonce store error:", insertError);
        return jsonResponse({ error: "Authentication service unavailable" }, 503);
      }
    } else {
      console.warn("[wallet-auth] Admin client not configured — replay protection disabled");
    }

    // 5. Issue Supabase-compatible JWT (no separate address derivation needed —
    //    verifySignatureForAddress already proved the signer owns the address)
    const jwtSecret = Deno.env.get("JWT_SIGNING_SECRET");
    if (!jwtSecret) {
      console.error("[wallet-auth] JWT_SIGNING_SECRET not configured");
      return jsonResponse({ error: "Server configuration error" }, 500);
    }

    const secret = new TextEncoder().encode(jwtSecret);
    const token = await new SignJWT({
      sub: address,
      role: "authenticated",
      aud: "authenticated",
      wallet_address: address,
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt()
      .setExpirationTime(TOKEN_EXPIRY)
      .setIssuer("supabase")
      .sign(secret);

    return jsonResponse({ token, expiresIn: 86400 });
  } catch (err) {
    console.error("[wallet-auth] Error:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Authentication failed" },
      400,
    );
  }
});
