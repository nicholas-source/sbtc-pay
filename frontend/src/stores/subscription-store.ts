import { create } from "zustand";
import { addWeeks, addMonths, addYears } from "date-fns";
import { toast } from "sonner";
import type { Payment } from "./invoice-store";
import { useMerchantStore } from "./merchant-store";
import { useNotificationLogStore, type NotifEventKey } from "./notification-log-store";
import { supabaseWithWallet } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";

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
  fetchSubscriptions: (merchantPrincipal: string) => Promise<void>;
  createPlan: (data: Omit<SubscriptionPlan, "id" | "createdAt" | "isActive" | "merchantAddress">) => SubscriptionPlan;
  togglePlan: (id: string) => void;
  getPlansForMerchant: (address: string) => SubscriptionPlan[];
  pauseSubscription: (id: string) => void;
  resumeSubscription: (id: string) => void;
  cancelSubscription: (id: string) => void;
  simulateRenewal: (subscriberId: string) => Payment | null;
}

function generatePlanId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let r = "";
  for (let i = 0; i < 4; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `PLAN-${r}`;
}

function randomTxId(): string {
  const hex = "0123456789abcdef";
  let r = "0x";
  for (let i = 0; i < 40; i++) r += hex[Math.floor(Math.random() * 16)];
  return r;
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

  if (hasWebhook) {
    toast.info(`Webhook notification sent for: ${label}`);
  }

  const channel: "email" | "webhook" | "both" = hasEmail && hasWebhook ? "both" : hasEmail ? "email" : "webhook";
  useNotificationLogStore.getState().addLog({ eventType: eventKey, label, timestamp: new Date(), channel });
}

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  plans: [],
  subscribers: [],
  isLoading: false,

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

      set({
        plans: Array.from(planMap.values()),
        subscribers,
        isLoading: false,
      });
    } catch {
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

  pauseSubscription: (id) => {
    set((s) => ({
      subscribers: s.subscribers.map((sub) =>
        sub.id === id && sub.status === "active" ? { ...sub, status: "paused" as SubscriberStatus } : sub
      ),
    }));
    notifyEvent("pauseResume", "Subscription Paused");
  },

  resumeSubscription: (id) => {
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
  },

  cancelSubscription: (id) => {
    set((s) => ({
      subscribers: s.subscribers.map((sub) =>
        sub.id === id && sub.status !== "cancelled" ? { ...sub, status: "cancelled" as SubscriberStatus } : sub
      ),
    }));
    notifyEvent("cancellation", "Subscription Cancelled");
  },

  simulateRenewal: (subscriberId) => {
    const sub = get().subscribers.find((s) => s.id === subscriberId);
    if (!sub || sub.status !== "active") return null;
    const plan = get().plans.find((p) => p.id === sub.planId);
    if (!plan) return null;

    const payment: Payment = {
      timestamp: new Date(),
      amount: plan.amount,
      txId: randomTxId(),
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
    return payment;
  },
}));
