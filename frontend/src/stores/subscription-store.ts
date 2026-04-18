import { create } from "zustand";
import { addWeeks, addMonths, addYears } from "date-fns";
import { toast } from "sonner";
import type { Payment } from "./invoice-store";
import { useMerchantStore } from "./merchant-store";
import { useNotificationLogStore, type NotifEventKey } from "./notification-log-store";
import { supabaseWithWallet } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import {
  pauseSubscription as pauseSubOnChain,
  resumeSubscription as resumeSubOnChain,
  cancelSubscription as cancelSubOnChain,
  processSubscriptionPayment as processSubPaymentOnChain,
  getSubscription as getSubOnChain,
  CONTRACT_ERRORS,
} from "@/lib/stacks/contract";
import type { TokenType } from "@/lib/stacks/config";

export type SubscriptionInterval = "weekly" | "monthly" | "yearly";
export type SubscriberStatus = "active" | "paused" | "cancelled";

export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  amount: number;
  interval: SubscriptionInterval;
  merchantAddress: string;
  createdAt: Date;
  isActive: boolean;
  tokenType: TokenType;
}

export interface Subscriber {
  id: string;
  planId: string;
  payerAddress: string;
  status: SubscriberStatus;
  startedAt: Date;
  nextPaymentAt: Date;
  payments: Payment[];
}

interface SubscriptionStore {
  plans: SubscriptionPlan[];
  subscribers: Subscriber[];
  isLoading: boolean;
  pendingTxIds: Set<string>; // subscriber IDs with pending on-chain tx
  fetchSubscriptions: (merchantPrincipal: string) => Promise<void>;
  createPlan: (data: Omit<SubscriptionPlan, "id" | "createdAt" | "isActive" | "merchantAddress">) => SubscriptionPlan;
  togglePlan: (id: string) => void;
  getPlansForMerchant: (address: string) => SubscriptionPlan[];
  pauseSubscription: (id: string) => Promise<void>;
  resumeSubscription: (id: string) => Promise<void>;
  cancelSubscription: (id: string) => Promise<void>;
  processRenewal: (subscriberId: string) => Promise<void>;
}

function generatePlanId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let r = "";
  for (let i = 0; i < 4; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `PLAN-${r}`;
}

function nextPayment(from: Date, interval: SubscriptionInterval): Date {
  switch (interval) {
    case "weekly": return addWeeks(from, 1);
    case "monthly": return addMonths(from, 1);
    case "yearly": return addYears(from, 1);
  }
}

// Map block interval to human interval
function blocksToInterval(blocks: number): SubscriptionInterval {
  // ~10 min per block: weekly ≈ 1008, monthly ≈ 4320, yearly ≈ 52560
  if (blocks <= 2000) return "weekly";
  if (blocks <= 15000) return "monthly";
  return "yearly";
}

// DB status → frontend
const SUB_STATUS_MAP: Record<number, SubscriberStatus> = {
  0: "active",
  1: "paused",
  2: "cancelled",
};

function notifyEvent(eventKey: NotifEventKey, label: string) {
  const profile = useMerchantStore.getState().profile;
  if (!profile?.notifications) return;
  if (!profile.notifications.events[eventKey]) return;

  const hasEmail = !!profile.notifications.email;
  const hasWebhook = !!profile.notifications.webhookUrl;

  // Attempt real webhook delivery if configured
  if (hasWebhook) {
    const webhookUrl = profile.notifications.webhookUrl;
    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: eventKey,
        label,
        merchant: profile.id,
        timestamp: new Date().toISOString(),
      }),
    }).then(() => {
      toast.success(`Webhook delivered: ${label}`);
    }).catch(() => {
      toast.warning(`Webhook delivery failed for: ${label}`, {
        description: "The endpoint may be unreachable or blocked by CORS.",
      });
    });
  }

  const channel: "email" | "webhook" | "both" = hasEmail && hasWebhook ? "both" : hasEmail ? "email" : "webhook";
  useNotificationLogStore.getState().addLog({ eventType: eventKey, label, timestamp: new Date(), channel });
}

/** Extract numeric on-chain ID from store ID like "SUB-42" */
function parseChainId(storeId: string): number {
  const num = parseInt(storeId.replace("SUB-", ""), 10);
  if (isNaN(num)) throw new Error(`Invalid subscription ID: ${storeId}`);
  return num;
}

/** Map contract error codes to user-friendly messages */
function contractErrorMsg(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  for (const [code, label] of Object.entries(CONTRACT_ERRORS)) {
    if (msg.includes(code)) return label;
  }
  return msg;
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  plans: [],
  subscribers: [],
  isLoading: false,
  pendingTxIds: new Set<string>(),

  fetchSubscriptions: async (merchantPrincipal) => {
    set({ isLoading: true });
    try {
      // Fetch subscriptions for this merchant
      // Use wallet-aware client so RLS allows reading merchant subscriptions
      const db = supabaseWithWallet(merchantPrincipal);
      const { data: subRows, error: subErr } = await db
        .from("subscriptions")
        .select("*")
        .eq("merchant_principal", merchantPrincipal)
        .order("id", { ascending: false });

      if (subErr) throw subErr;
      if (!subRows || subRows.length === 0) {
        set({ plans: [], subscribers: [], isLoading: false });
        return;
      }

      // Fetch subscription payments
      const subIds = subRows.map((r) => r.id);
      const { data: paymentRows } = await db
        .from("subscription_payments")
        .select("*")
        .in("subscription_id", subIds);

      const paymentsBySub = new Map<number, Tables<"subscription_payments">[]>();
      for (const p of paymentRows ?? []) {
        const arr = paymentsBySub.get(p.subscription_id) ?? [];
        arr.push(p);
        paymentsBySub.set(p.subscription_id, arr);
      }

      // Derive unique plans from subscription data (grouped by name + amount + interval)
      const planMap = new Map<string, SubscriptionPlan>();
      const subscribers: Subscriber[] = [];

      for (const row of subRows) {
        const interval = blocksToInterval(row.interval_blocks);
        const planKey = `${row.name}-${row.amount}-${row.interval_blocks}`;

        if (!planMap.has(planKey)) {
          planMap.set(planKey, {
            id: `PLAN-${row.id}`,
            name: row.name,
            description: "",
            amount: row.amount,
            interval,
            merchantAddress: row.merchant_principal,
            createdAt: new Date(row.created_at),
            isActive: row.status === 0,
            tokenType: (row.token_type as TokenType) || 'sbtc',
          });
        }

        const payments = (paymentsBySub.get(row.id) ?? []).map((p) => ({
          timestamp: new Date(p.created_at),
          amount: p.amount,
          txId: p.tx_id || "",
        }));

        // Estimate next payment date from block height
        const now = new Date();
        const nextDate = nextPayment(now, interval);

        subscribers.push({
          id: `SUB-${row.id}`,
          planId: `PLAN-${row.id}`,
          payerAddress: row.subscriber,
          status: SUB_STATUS_MAP[row.status] ?? "active",
          startedAt: new Date(row.created_at),
          nextPaymentAt: nextDate,
          payments,
        });
      }

      // Reconcile each subscriber with on-chain data (source of truth)
      const chainResults = await Promise.allSettled(
        subscribers.map((sub) => {
          const numId = parseInt(sub.id.replace("SUB-", ""), 10);
          return getSubOnChain(numId, merchantPrincipal);
        }),
      );

      const reconciledSubs: Subscriber[] = [];
      const reconciledPlans = new Map(planMap);
      const fixes: Array<{ id: number; data: { status?: number; amount?: number; name?: string } }> = [];

      for (let i = 0; i < subscribers.length; i++) {
        const sub = subscribers[i];
        const result = chainResults[i];

        if (result.status === "rejected" || !result.value) {
          reconciledSubs.push(sub); // chain unavailable, keep Supabase data
          continue;
        }

        const chain = result.value;
        const chainStatus = SUB_STATUS_MAP[chain.status] ?? "active";
        const chainAmount = Number(chain.amount);
        const dbId = parseInt(sub.id.replace("SUB-", ""), 10);

        // Correct subscriber from chain
        const corrected: Subscriber = {
          ...sub,
          payerAddress: chain.subscriber,
          status: chainStatus,
          payments: sub.payments, // keep payment history from Supabase
        };
        reconciledSubs.push(corrected);

        // Correct plan from chain
        const planKey = sub.planId;
        const existing = reconciledPlans.get(planKey) ?? reconciledPlans.values().next().value;
        if (existing) {
          reconciledPlans.set(planKey, {
            ...existing,
            name: chain.name || existing.name,
            amount: chainAmount,
            isActive: chain.status === 0,
          });
        }

        // Detect stale Supabase rows and queue background fixes
        if (
          sub.status !== chainStatus ||
          (reconciledPlans.get(planKey)?.amount ?? 0) !== chainAmount
        ) {
          fixes.push({
            id: dbId,
            data: { status: chain.status, amount: chainAmount, name: chain.name },
          });
        }
      }

      // Background-fix stale Supabase rows
      if (fixes.length > 0) {
        const db = supabaseWithWallet(merchantPrincipal);
        Promise.all(
          fixes.map(({ id, data }) => db.from("subscriptions").update(data).eq("id", id)),
        ).catch((err) => console.warn("[reconcile-subs] Background fix failed:", err));
      }

      set({
        plans: Array.from(reconciledPlans.values()),
        subscribers: reconciledSubs,
        isLoading: false,
      });
    } catch (err) {
      console.error("Failed to fetch subscriptions:", err);
      set({ isLoading: false });
    }
  },

  createPlan: (data) => {
    const plan: SubscriptionPlan = {
      ...data,
      id: generatePlanId(),
      merchantAddress: "",
      createdAt: new Date(),
      isActive: true,
    };
    set((s) => ({ plans: [plan, ...s.plans] }));
    return plan;
  },

  togglePlan: (id) => {
    set((s) => ({
      plans: s.plans.map((p) => (p.id === id ? { ...p, isActive: !p.isActive } : p)),
    }));
  },

  getPlansForMerchant: (address) => get().plans.filter((p) => p.merchantAddress === address),

  pauseSubscription: async (id) => {
    const chainId = parseChainId(id);
    set((s) => ({ pendingTxIds: new Set([...s.pendingTxIds, id]) }));
    try {
      await pauseSubOnChain(chainId);
      set((s) => ({
        subscribers: s.subscribers.map((sub) =>
          sub.id === id && sub.status === "active" ? { ...sub, status: "paused" as SubscriberStatus } : sub
        ),
      }));
      notifyEvent("pauseResume", "Subscription Paused");
    } catch (err) {
      throw new Error(contractErrorMsg(err));
    } finally {
      set((s) => {
        const next = new Set(s.pendingTxIds);
        next.delete(id);
        return { pendingTxIds: next };
      });
    }
  },

  resumeSubscription: async (id) => {
    const chainId = parseChainId(id);
    set((s) => ({ pendingTxIds: new Set([...s.pendingTxIds, id]) }));
    try {
      await resumeSubOnChain(chainId);
      set((s) => ({
        subscribers: s.subscribers.map((sub) => {
          if (sub.id !== id || sub.status !== "paused") return sub;
          const plan = s.plans.find((p) => p.id === sub.planId);
          return {
            ...sub,
            status: "active" as SubscriberStatus,
            nextPaymentAt: plan ? nextPayment(new Date(), plan.interval) : sub.nextPaymentAt,
          };
        }),
      }));
      notifyEvent("pauseResume", "Subscription Resumed");
    } catch (err) {
      throw new Error(contractErrorMsg(err));
    } finally {
      set((s) => {
        const next = new Set(s.pendingTxIds);
        next.delete(id);
        return { pendingTxIds: next };
      });
    }
  },

  cancelSubscription: async (id) => {
    const chainId = parseChainId(id);
    set((s) => ({ pendingTxIds: new Set([...s.pendingTxIds, id]) }));
    try {
      await cancelSubOnChain(chainId);
      set((s) => ({
        subscribers: s.subscribers.map((sub) =>
          sub.id === id && sub.status !== "cancelled" ? { ...sub, status: "cancelled" as SubscriberStatus } : sub
        ),
      }));
      notifyEvent("cancellation", "Subscription Cancelled");
    } catch (err) {
      throw new Error(contractErrorMsg(err));
    } finally {
      set((s) => {
        const next = new Set(s.pendingTxIds);
        next.delete(id);
        return { pendingTxIds: next };
      });
    }
  },

  processRenewal: async (subscriberId) => {
    const sub = get().subscribers.find((s) => s.id === subscriberId);
    if (!sub || sub.status !== "active") throw new Error("Subscription is not active");
    const plan = get().plans.find((p) => p.id === sub.planId);
    if (!plan) throw new Error("Plan not found");

    const chainId = parseChainId(subscriberId);
    set((s) => ({ pendingTxIds: new Set([...s.pendingTxIds, subscriberId]) }));
    try {
      const { txId } = await processSubPaymentOnChain({
        subscriptionId: chainId,
        amount: BigInt(plan.amount),
        subscriberAddress: sub.payerAddress,
        tokenType: plan.tokenType,
      });

      const payment: Payment = {
        timestamp: new Date(),
        amount: plan.amount,
        txId,
      };

      set((s) => ({
        subscribers: s.subscribers.map((existing) =>
          existing.id === subscriberId
            ? {
                ...existing,
                nextPaymentAt: nextPayment(new Date(), plan.interval),
                payments: [...existing.payments, payment],
              }
            : existing
        ),
      }));

      notifyEvent("renewal", "Renewal Processed");
    } catch (err) {
      throw new Error(contractErrorMsg(err));
    } finally {
      set((s) => {
        const next = new Set(s.pendingTxIds);
        next.delete(subscriberId);
        return { pendingTxIds: next };
      });
    }
  },
}));
