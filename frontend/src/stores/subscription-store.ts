import { create } from "zustand";
import { persist } from "zustand/middleware";
import { addWeeks, addMonths, addYears } from "date-fns";
import { toast } from "sonner";
import type { Payment } from "./invoice-store";
import { useMerchantStore } from "./merchant-store";
import { useNotificationLogStore, type NotifEventKey } from "./notification-log-store";
import { useWalletStore } from "./wallet-store";
import { supabaseWithWallet } from "@/lib/supabase/client";
import type { Tables } from "@/lib/supabase/types";
import { fetchBurnBlockHeight, AVG_BLOCK_TIME_SECONDS } from "@/lib/stacks/config";
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
  localPlans: SubscriptionPlan[]; // merchant-created templates, persisted to localStorage
  subscribers: Subscriber[];
  isLoading: boolean;
  pendingTxIds: Set<string>; // subscriber IDs with pending on-chain tx
  fetchSubscriptions: (merchantPrincipal: string) => Promise<void>;
  fetchMySubscriptions: (subscriberAddress: string) => Promise<void>;
  createPlan: (data: Omit<SubscriptionPlan, "id" | "createdAt" | "isActive" | "merchantAddress">) => SubscriptionPlan;
  deletePlan: (id: string) => void;
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

/**
 * Estimate a Date from a burn block height.
 * Uses the current burn block height and AVG_BLOCK_TIME_SECONDS (~600s per Bitcoin block).
 * If the target block is in the past, returns a past date (payment is due).
 */
function estimateDateFromBlock(targetBlock: number, currentBlock: number): Date {
  const blockDelta = targetBlock - currentBlock;
  const msDelta = blockDelta * AVG_BLOCK_TIME_SECONDS * 1000;
  return new Date(Date.now() + msDelta);
}

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

// Reconciliation cooldown: skip expensive chain reads if we reconciled recently
const SUB_RECONCILE_COOLDOWN_MS = 60_000; // 60 seconds
let _subLastReconcileTime = 0;

export const useSubscriptionStore = create<SubscriptionStore>()(
  persist(
    (set, get) => ({
  plans: [],
  localPlans: [],
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
        // No DB subscriptions yet — keep local plans, clear only DB-derived data
        const { localPlans } = get();
        set({ plans: [...localPlans], subscribers: [], isLoading: false });
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

      // Get current burn block height to estimate dates from block heights
      const currentBlock = await fetchBurnBlockHeight().catch(() => 0);

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

        // Use the grouped plan's ID so all subs of the same type link to one plan card
        const groupedPlanId = planMap.get(planKey)!.id;

        const payments = (paymentsBySub.get(row.id) ?? []).map((p) => ({
          timestamp: new Date(p.created_at),
          amount: p.amount,
          txId: p.tx_id || "",
          payer: p.subscriber || "",
        }));

        // Estimate next payment date from block height
        const nextPaymentBlock = row.next_payment_at_block ?? 0;
        const nextDate = currentBlock > 0
          ? estimateDateFromBlock(nextPaymentBlock, currentBlock)
          : nextPayment(new Date(), interval);

        subscribers.push({
          id: `SUB-${row.id}`,
          planId: groupedPlanId,
          payerAddress: row.subscriber,
          status: SUB_STATUS_MAP[row.status] ?? "active",
          startedAt: new Date(row.created_at),
          nextPaymentAt: nextDate,
          payments,
        });
      }

      // Reconcile each subscriber with on-chain data (source of truth)
      // Use concurrency limit to avoid 429 rate limits from Hiro API
      // Skip if we reconciled within the last 60 seconds
      const shouldReconcile = Date.now() - _subLastReconcileTime >= SUB_RECONCILE_COOLDOWN_MS;

      const chainResults: PromiseSettledResult<Awaited<ReturnType<typeof getSubOnChain>>>[] = [];
      if (shouldReconcile) {
      const subTasks = subscribers.map((sub) => {
        const numId = parseInt(sub.id.replace("SUB-", ""), 10);
        return () => getSubOnChain(numId, merchantPrincipal);
      });
      // Process max 3 at a time
      let taskIdx = 0;
      async function subWorker() {
        while (taskIdx < subTasks.length) {
          const i = taskIdx++;
          try {
            chainResults[i] = { status: 'fulfilled', value: await subTasks[i]() };
          } catch (reason) {
            chainResults[i] = { status: 'rejected', reason } as PromiseRejectedResult;
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(3, subTasks.length) }, () => subWorker()));
      _subLastReconcileTime = Date.now();
      }

      const reconciledSubs: Subscriber[] = [];
      // Re-key plan map by plan ID for O(1) lookup during reconciliation
      const reconciledPlans = new Map<string, SubscriptionPlan>();
      for (const plan of planMap.values()) {
        reconciledPlans.set(plan.id, plan);
      }
      const fixes: Array<{ id: number; data: { status?: number; amount?: number; name?: string } }> = [];

      for (let i = 0; i < subscribers.length; i++) {
        const sub = subscribers[i];
        const result = chainResults[i];

        if (!result || result.status === "rejected" || !result.value) {
          reconciledSubs.push(sub); // chain unavailable or cooldown, keep Supabase data
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
        // Use on-chain next-payment-at block height for accurate date
        if (currentBlock > 0 && chain.nextPaymentAt) {
          corrected.nextPaymentAt = estimateDateFromBlock(chain.nextPaymentAt, currentBlock);
        }
        reconciledSubs.push(corrected);

        // Correct plan from chain
        const existingPlan = reconciledPlans.get(sub.planId);
        if (existingPlan) {
          reconciledPlans.set(sub.planId, {
            ...existingPlan,
            name: chain.name || existingPlan.name,
            amount: chainAmount,
            isActive: chain.status === 0,
          });
        }

        // Detect stale Supabase rows and queue background fixes
        if (
          sub.status !== chainStatus ||
          (existingPlan?.amount ?? 0) !== chainAmount
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

      // Merge DB-derived plans with locally-created plans (templates)
      const dbPlans = Array.from(reconciledPlans.values());
      const dbPlanIds = new Set(dbPlans.map((p) => p.id));
      // Also build a set of name+amount+interval keys for secondary dedup
      const dbPlanKeys = new Set(dbPlans.map((p) =>
        `${p.name}-${p.amount}-${blocksToInterval(0) === p.interval ? 0 : p.interval}`
      ));
      const dbPlanNameKeys = new Set(dbPlans.map((p) => `${p.name}-${p.amount}-${p.interval}`));
      const { localPlans } = get();
      const mergedPlans = [
        ...localPlans.filter((lp) =>
          !dbPlanIds.has(lp.id) &&
          !dbPlanNameKeys.has(`${lp.name}-${lp.amount}-${lp.interval}`)
        ),
        ...dbPlans,
      ];

      set({
        plans: mergedPlans,
        subscribers: reconciledSubs,
        isLoading: false,
      });
    } catch (err) {
      console.error("Failed to fetch subscriptions:", err);
      set({ isLoading: false });
    }
  },

  /**
   * Fetch subscriptions where the connected wallet is the SUBSCRIBER (payer).
   * Used by the Customer Portal so subscribers can see & pay their own subscriptions.
   */
  fetchMySubscriptions: async (subscriberAddress) => {
    set({ isLoading: true });
    try {
      const db = supabaseWithWallet(subscriberAddress);
      const { data: subRows, error: subErr } = await db
        .from("subscriptions")
        .select("*")
        .eq("subscriber", subscriberAddress)
        .order("id", { ascending: false });

      if (subErr) throw subErr;
      if (!subRows || subRows.length === 0) {
        // Keep existing plans/subscribers from merchant context, just mark done
        set({ isLoading: false });
        return;
      }

      // Fetch subscription payments for these subscriptions
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

      // Build plans and subscribers from rows
      const newPlans: SubscriptionPlan[] = [];
      const newSubscribers: Subscriber[] = [];
      const seenPlanKeys = new Map<string, string>(); // planKey → planId

      // Get current burn block height to estimate dates from block heights
      const currentBlock = await fetchBurnBlockHeight().catch(() => 0);

      for (const row of subRows) {
        const interval = blocksToInterval(row.interval_blocks);
        const planKey = `${row.merchant_principal}-${row.name}-${row.amount}-${row.interval_blocks}`;
        const planId = `PLAN-${row.id}`;

        if (!seenPlanKeys.has(planKey)) {
          seenPlanKeys.set(planKey, planId);
          newPlans.push({
            id: planId,
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
          payer: p.subscriber || "",
        }));

        // Estimate next payment date from block height (not just now + interval)
        const nextPaymentBlock = row.next_payment_at_block ?? 0;
        const nextDate = currentBlock > 0
          ? estimateDateFromBlock(nextPaymentBlock, currentBlock)
          : nextPayment(new Date(), interval); // fallback if block height unavailable

        // Use the grouped plan's ID so all subs of the same type link to one plan card
        const groupedPlanId = seenPlanKeys.get(planKey) ?? planId;

        newSubscribers.push({
          id: `SUB-${row.id}`,
          planId: groupedPlanId,
          payerAddress: row.subscriber,
          status: SUB_STATUS_MAP[row.status] ?? "active",
          startedAt: new Date(row.created_at),
          nextPaymentAt: nextDate,
          payments,
        });
      }

      // Reconcile with on-chain data
      const chainResults = await Promise.allSettled(
        newSubscribers.map((sub) => {
          const numId = parseInt(sub.id.replace("SUB-", ""), 10);
          const plan = newPlans.find((p) => p.id === sub.planId);
          return getSubOnChain(numId, plan?.merchantAddress || "");
        }),
      );

      for (let i = 0; i < newSubscribers.length; i++) {
        const result = chainResults[i];
        if (result.status === "fulfilled" && result.value) {
          const chain = result.value;
          newSubscribers[i].status = SUB_STATUS_MAP[chain.status] ?? "active";
          newSubscribers[i].payerAddress = chain.subscriber;
          // Use on-chain next-payment-at block height for accurate date
          if (currentBlock > 0 && chain.nextPaymentAt) {
            newSubscribers[i].nextPaymentAt = estimateDateFromBlock(chain.nextPaymentAt, currentBlock);
          }
        }
      }

      // Merge with existing data (don't clobber merchant-side data)
      const newSubIds = new Set(newSubscribers.map((ns) => ns.id));

      set((s) => ({
        plans: [
          ...s.plans,
          ...newPlans.filter((p) => !new Set(s.plans.map((x) => x.id)).has(p.id)),
        ],
        subscribers: [
          ...s.subscribers.filter((sub) => !newSubIds.has(sub.id)),
          ...newSubscribers,
        ],
        isLoading: false,
      }));
    } catch (err) {
      console.error("Failed to fetch my subscriptions:", err);
      set({ isLoading: false });
    }
  },

  createPlan: (data) => {
    const merchantAddress = useWalletStore.getState().address || "";
    const plan: SubscriptionPlan = {
      ...data,
      id: generatePlanId(),
      merchantAddress,
      createdAt: new Date(),
      isActive: true,
    };
    set((s) => ({
      plans: [plan, ...s.plans],
      localPlans: [plan, ...s.localPlans],
    }));
    return plan;
  },

  deletePlan: (id) => {
    set((s) => ({
      plans: s.plans.filter((p) => p.id !== id),
      localPlans: s.localPlans.filter((p) => p.id !== id),
    }));
  },

  togglePlan: (id) => {
    set((s) => ({
      plans: s.plans.map((p) => (p.id === id ? { ...p, isActive: !p.isActive } : p)),
      localPlans: s.localPlans.map((p) => (p.id === id ? { ...p, isActive: !p.isActive } : p)),
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
      // Contract sets next-payment-at based on last-payment-at + interval,
      // or burn-block-height if that's already passed. Fetch on-chain state for accuracy.
      const currentBlock = await fetchBurnBlockHeight().catch(() => 0);
      const sub = get().subscribers.find((s) => s.id === id);
      const plan = sub ? get().plans.find((p) => p.id === sub.planId) : null;
      let chainNextDate: Date | null = null;
      if (currentBlock > 0 && plan) {
        try {
          const chain = await getSubOnChain(chainId, plan.merchantAddress);
          if (chain) {
            chainNextDate = estimateDateFromBlock(chain.nextPaymentAt, currentBlock);
          }
        } catch { /* fall through to estimate */ }
      }

      set((s) => ({
        subscribers: s.subscribers.map((sub) => {
          if (sub.id !== id || sub.status !== "paused") return sub;
          return {
            ...sub,
            status: "active" as SubscriberStatus,
            nextPaymentAt: chainNextDate ?? sub.nextPaymentAt,
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
        payer: sub.payerAddress,
      };

      // Estimate next payment from block height (contract sets next-payment-at = burn-block-height + interval-blocks)
      const currentBlock = await fetchBurnBlockHeight().catch(() => 0);
      const intervalBlocks = plan.interval === "weekly" ? 1008 : plan.interval === "monthly" ? 4320 : 52560;
      const nextDate = currentBlock > 0
        ? estimateDateFromBlock(currentBlock + intervalBlocks, currentBlock)
        : nextPayment(new Date(), plan.interval);

      set((s) => ({
        subscribers: s.subscribers.map((existing) =>
          existing.id === subscriberId
            ? {
                ...existing,
                nextPaymentAt: nextDate,
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
    }),
    {
      name: 'sbtc-pay-subscription-plans',
      partialize: (state) => ({
        localPlans: state.localPlans,
      }),
      onRehydrateStorage: () => (state) => {
        // After hydration, revive Date fields and populate plans from persisted localPlans
        if (state?.localPlans?.length) {
          for (const p of state.localPlans) {
            if (typeof p.createdAt === 'string') p.createdAt = new Date(p.createdAt);
          }
          state.plans = [...state.localPlans];
        }
      },
    }
  )
);
