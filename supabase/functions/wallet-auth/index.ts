// Wallet-based JWT authentication for sBTC Pay
// Verifies a Stacks wallet signature and issues a Supabase-compatible JWT.
// Flow: client signs a timestamped message → this function verifies → returns JWT.

import { SignJWT } from "https://deno.land/x/jose@v5.2.0/index.ts";
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

// ── Stacks message hashing ──────────────────────────────────────────────────
// Two known prefix bytes used across wallet implementations
const PREFIXES = [
  "\x18Stacks Signed Message:\n",  // @stacks/encryption standard
  "\x17Stacks Signed Message:\n",  // alternate
];

function hashWithPrefix(prefix: string, message: string): Uint8Array {
  const prefixBytes = utf8ToBytes(prefix);
  const messageBytes = utf8ToBytes(message);
  // Use JS string length (matches @stacks/encryption's message.length)
  const lengthBytes = utf8ToBytes(String(message.length));
  return sha256(concatBytes(prefixBytes, lengthBytes, messageBytes));
}

// ── Signature verification ──────────────────────────────────────────────────
interface VerifyResult {
  valid: boolean;
  debug?: string;
}

function verifySignature(
  message: string,
  signatureHex: string,
  expectedPubKeyHex: string,
): VerifyResult {
  const cleanHex = signatureHex.startsWith("0x") ? signatureHex.slice(2) : signatureHex;
  const sigBytes = hexToBytes(cleanHex);

  if (sigBytes.length !== 65) {
    return { valid: false, debug: `bad sig length: ${sigBytes.length}` };
  }

  // Two possible byte orders: VRS [v(1)+r(32)+s(32)] and RSV [r(32)+s(32)+v(1)]
  const formats = [
    { name: "VRS", v: sigBytes[0], r: sigBytes.slice(1, 33), s: sigBytes.slice(33, 65) },
    { name: "RSV", v: sigBytes[64], r: sigBytes.slice(0, 32), s: sigBytes.slice(32, 64) },
  ];

  const attempts: string[] = [];

  for (const prefix of PREFIXES) {
    const hash = hashWithPrefix(prefix, message);
    for (const fmt of formats) {
      const recoveryId = fmt.v > 27 ? fmt.v - 27 : fmt.v; // handle Ethereum-style v=27/28
      if (recoveryId > 3) {
        attempts.push(`${fmt.name}+0x${prefix.charCodeAt(0).toString(16)}: v=${fmt.v} (skip, too large)`);
        continue;
      }
      try {
        const r = BigInt("0x" + bytesToHex(fmt.r));
        const s = BigInt("0x" + bytesToHex(fmt.s));
        const sig = new secp256k1.Signature(r, s).addRecoveryBit(recoveryId);
        const recovered = sig.recoverPublicKey(hash);
        const recoveredHex = recovered.toHex(true);
        if (recoveredHex === expectedPubKeyHex) {
          return { valid: true, debug: `${fmt.name}+0x${prefix.charCodeAt(0).toString(16)}` };
        }
        attempts.push(`${fmt.name}+0x${prefix.charCodeAt(0).toString(16)}: v=${fmt.v} recovered=${recoveredHex.slice(0, 10)}… expected=${expectedPubKeyHex.slice(0, 10)}…`);
      } catch (e) {
        attempts.push(`${fmt.name}+0x${prefix.charCodeAt(0).toString(16)}: v=${fmt.v} error=${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { valid: false, debug: attempts.join(" | ") };
}

// ── Address derivation from compressed public key ───────────────────────────
function pubKeyToStxAddress(publicKeyHex: string, isTestnet: boolean): string {
  const pubKeyBytes = hexToBytes(publicKeyHex);
  const hash = ripemd160(sha256(pubKeyBytes));
  // c32 version: 22 = mainnet P2PKH (SP...), 26 = testnet P2PKH (ST...)
  const version = isTestnet ? 26 : 22;
  return c32address(version, bytesToHex(hash));
}

// ── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const { message, signature, publicKey, address } = body as {
      message?: string;
      signature?: string;
      publicKey?: string;
      address?: string;
    };

    if (!message || !signature || !publicKey || !address) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: message, signature, publicKey, address" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // 1. Verify message freshness (prevents replay attacks)
    const tsMatch = message.match(/Timestamp: (\d+)/);
    if (!tsMatch) {
      return new Response(
        JSON.stringify({ error: "Invalid message format — missing timestamp" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }
    const timestamp = parseInt(tsMatch[1], 10);
    if (isNaN(timestamp) || Math.abs(Date.now() - timestamp) > MAX_MESSAGE_AGE_MS) {
      return new Response(
        JSON.stringify({ error: "Message expired. Please sign again." }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // 2. Verify the signature was produced by the claimed public key
    const result = verifySignature(message, signature, publicKey);
    if (!result.valid) {
      console.warn("[wallet-auth] Verification failed:", result.debug);
      return new Response(
        JSON.stringify({ error: "Invalid signature", debug: result.debug }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // 3. Verify the public key derives to the claimed address
    const isTestnet = address.startsWith("ST");
    const derivedAddress = pubKeyToStxAddress(publicKey, isTestnet);
    if (derivedAddress !== address) {
      return new Response(
        JSON.stringify({ error: "Public key does not match claimed address" }),
        { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }

    // 4. Issue Supabase-compatible JWT
    const jwtSecret = Deno.env.get("SUPABASE_JWT_SECRET");
    if (!jwtSecret) {
      console.error("[wallet-auth] SUPABASE_JWT_SECRET not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
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

    return new Response(
      JSON.stringify({ token, expiresIn: 86400 }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[wallet-auth] Error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Authentication failed" }),
      { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
    );
  }
});
