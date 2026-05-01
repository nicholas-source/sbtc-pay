/**
 * Pure data-transformation functions shared between the admin
 * PlatformAnalyticsPanel and the merchant MerchantAnalyticsPanel.
 *
 * All functions are stateless and free of side-effects so they can be
 * unit-tested without any React or Supabase setup.
 */

import { eachDayOfInterval, format, subDays } from "date-fns";

// ── Row shapes (lowest-common-denominator between Supabase rows and Invoice objects) ──

export interface PaymentRow {
  amount: number;
  fee: number | null;
  token_type: string;   // "sbtc" | "stx"
  created_at: string;   // ISO-8601
}

export interface InvoiceRow {
  status: string;       // "pending" | "partial" | "paid" | "expired" | "cancelled" | "refunded"
  created_at: string;   // ISO-8601
}

// ── Output shapes ─────────────────────────────────────────────────────────────

export interface DailyVolume {
  date: string;         // formatted label ("Mon", "Apr 1", …)
  sbtc: number;         // payment count (sBTC)
  stx: number;          // payment count (STX)
  sbtcVol: number;      // raw sats
  stxVol: number;       // raw microSTX
}

export interface DailyConversion {
  date: string;
  paid: number;
  other: number;        // total − paid (pending / expired / cancelled)
  total: number;
  rate: number;         // 0–100
}

export interface TokenMix {
  sbtcCount: number;
  stxCount: number;
  sbtcVol: number;
  stxVol: number;
  sbtcFees: number;
  stxFees: number;
}

// ── Builders ──────────────────────────────────────────────────────────────────

/**
 * Bucket payments into daily bins within the last `days` days.
 * Returns one entry per calendar day (oldest first), each with
 * payment counts and raw token volume.
 */
export function buildVolume(payments: PaymentRow[], days: number): DailyVolume[] {
  const now   = new Date();
  const start = subDays(now, days - 1);
  const useShort = days <= 7;

  const map = new Map<string, DailyVolume>();
  eachDayOfInterval({ start, end: now }).forEach((d) => {
    const key   = format(d, "yyyy-MM-dd");
    const label = useShort ? format(d, "EEE") : format(d, "MMM d");
    map.set(key, { date: label, sbtc: 0, stx: 0, sbtcVol: 0, stxVol: 0 });
  });

  for (const p of payments) {
    const key = format(new Date(p.created_at), "yyyy-MM-dd");
    const pt  = map.get(key);
    if (!pt) continue;
    if (p.token_type === "stx") { pt.stx++;  pt.stxVol  += p.amount; }
    else                        { pt.sbtc++; pt.sbtcVol += p.amount; }
  }

  return [...map.values()];
}

/**
 * Bucket invoices by creation date and compute paid/total counts per day.
 * The `rate` field is the conversion rate (0–100) for that day.
 *
 * Labels are derived from the iterated Date object (not from re-parsing the
 * key string) to avoid UTC-midnight timezone shifts for users west of UTC.
 */
export function buildConversions(invoices: InvoiceRow[], days: number): DailyConversion[] {
  const now   = new Date();
  const start = subDays(now, days - 1);
  const useShort = days <= 7;

  const map = new Map<string, { label: string; paid: number; total: number }>();
  eachDayOfInterval({ start, end: now }).forEach((d) => {
    const key   = format(d, "yyyy-MM-dd");
    const label = useShort ? format(d, "EEE") : format(d, "MMM d");
    map.set(key, { label, paid: 0, total: 0 });
  });

  for (const inv of invoices) {
    const key = format(new Date(inv.created_at), "yyyy-MM-dd");
    const pt  = map.get(key);
    if (!pt) continue;
    pt.total++;
    if (inv.status === "paid") pt.paid++;
  }

  return [...map.values()].map((c) => ({
    date:  c.label,
    paid:  c.paid,
    other: c.total - c.paid,
    total: c.total,
    rate:  c.total > 0 ? Math.round((c.paid / c.total) * 100) : 0,
  }));
}

/**
 * Aggregate payment counts, volumes, and fees by token type.
 */
export function buildMix(payments: PaymentRow[]): TokenMix {
  return payments.reduce<TokenMix>(
    (acc, p) => {
      if (p.token_type === "stx") {
        acc.stxCount++;
        acc.stxVol   += p.amount;
        acc.stxFees  += p.fee ?? 0;
      } else {
        acc.sbtcCount++;
        acc.sbtcVol  += p.amount;
        acc.sbtcFees += p.fee ?? 0;
      }
      return acc;
    },
    { sbtcCount: 0, stxCount: 0, sbtcVol: 0, stxVol: 0, sbtcFees: 0, stxFees: 0 },
  );
}
