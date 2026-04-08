import { create } from "zustand";
import { subDays, addDays, addWeeks, addMonths, addYears } from "date-fns";
import { toast } from "sonner";
import type { Payment } from "./invoice-store";
import { useMerchantStore } from "./merchant-store";
import { useNotificationLogStore, type NotifEventKey } from "./notification-log-store";

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

function generateSubId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let r = "";
  for (let i = 0; i < 4; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `SUB-${r}`;
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

const merchantAddr = "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7";
const payerAddrs = [
  "SP1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE",
  "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE",
  "SP2C2YFP12AJZB1MAEP5RQHWER4NKFF4J5XFGYW7P",
  "SP1P72Z3704VMT3DMHPP2CB8TGQWGDBHD3RPR9GZS",
  "SP3D6PV2ACBPEKYJTCMH7HEN02KP87QSP8KTEH9JB",
  "SP1KE43GJQ0EZ7V0B35H9MAQGV1ZKD8WYN7YR2CGS",
  "SP2RN7TFJQ4X0B1KV3E9PZ6HY8MWCD5GJ2AQ3XKLE",
  "SP3GM8YD2FH5J0N7QW4TA6BX1RKCP9EZ3LVSH8MJD",
  "SP1BF4QKXZ7N2HY0RV9JE5WT6CL3GPMA8D4S9XHKR",
  "SP2JK8THNQ4WA6BY1XFCD9RP3EG5ZLM0SH7V2UCNE",
  "SP3AV5CDQR8FH2JN0KX7YWBE1PL6TG9SM4ZU3MKDI",
  "SP1HN9XQWZ4RK7CF3AJY8VT6BE2GP0DL5MS4UKEWR",
  "SP2TK5BMVN1QX8FG3RP7AZ4YWCE6HJ0DLS9UMKQXE",
  "SP3FQ2RKMZ7BY4XV1WT9AH6EJCN0PG5DL8US3KEAM",
  "SP1WQ4KXBN8FT3RV5YZ7AE6HJCM0GP2DL9US4RKMQ",
];

const now = new Date();

const seedPlans: SubscriptionPlan[] = [
  {
    id: "PLAN-BA5C",
    name: "Basic API Access",
    description: "Up to 10,000 API calls per month with standard rate limits.",
    amount: 50000,
    interval: "monthly",
    merchantAddress: merchantAddr,
    createdAt: subDays(now, 60),
    isActive: true,
  },
  {
    id: "PLAN-PR0H",
    name: "Pro Hosting",
    description: "Dedicated hosting with SSL, custom domains, and priority support.",
    amount: 150000,
    interval: "monthly",
    merchantAddress: merchantAddr,
    createdAt: subDays(now, 45),
    isActive: true,
  },
  {
    id: "PLAN-EN7P",
    name: "Enterprise Suite",
    description: "Unlimited API access, SLA guarantees, and a dedicated account manager.",
    amount: 500000,
    interval: "monthly",
    merchantAddress: merchantAddr,
    createdAt: subDays(now, 30),
    isActive: true,
  },
  {
    id: "PLAN-WK1Y",
    name: "Weekly Analytics",
    description: "Weekly analytics digest and dashboard access.",
    amount: 15000,
    interval: "weekly",
    merchantAddress: merchantAddr,
    createdAt: subDays(now, 20),
    isActive: false,
  },
];

const seedSubscribers: Subscriber[] = [
  {
    id: "SUB-A1B2",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[0],
    status: "active",
    startedAt: subDays(now, 55),
    nextPaymentAt: addDays(now, 5),
    payments: [
      { timestamp: subDays(now, 55), amount: 50000, txId: randomTxId() },
      { timestamp: subDays(now, 25), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-C3D4",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[1],
    status: "active",
    startedAt: subDays(now, 40),
    nextPaymentAt: addDays(now, 10),
    payments: [
      { timestamp: subDays(now, 40), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-E5F6",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[2],
    status: "paused",
    startedAt: subDays(now, 50),
    nextPaymentAt: addDays(now, 2),
    payments: [
      { timestamp: subDays(now, 50), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-G7H8",
    planId: "PLAN-PR0H",
    payerAddress: payerAddrs[0],
    status: "active",
    startedAt: subDays(now, 30),
    nextPaymentAt: addDays(now, 1),
    payments: [
      { timestamp: subDays(now, 30), amount: 150000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-I9J0",
    planId: "PLAN-PR0H",
    payerAddress: payerAddrs[3],
    status: "cancelled",
    startedAt: subDays(now, 35),
    nextPaymentAt: subDays(now, 5),
    payments: [
      { timestamp: subDays(now, 35), amount: 150000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-K1L2",
    planId: "PLAN-EN7P",
    payerAddress: payerAddrs[4],
    status: "active",
    startedAt: subDays(now, 25),
    nextPaymentAt: addDays(now, 5),
    payments: [
      { timestamp: subDays(now, 25), amount: 500000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-M3N4",
    planId: "PLAN-EN7P",
    payerAddress: payerAddrs[1],
    status: "paused",
    startedAt: subDays(now, 20),
    nextPaymentAt: addDays(now, 10),
    payments: [
      { timestamp: subDays(now, 20), amount: 500000, txId: randomTxId() },
    ],
  },
  // Additional PLAN-BA5C subscribers for pagination testing
  {
    id: "SUB-O1P2",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[5],
    status: "active",
    startedAt: subDays(now, 48),
    nextPaymentAt: addDays(now, 3),
    payments: [
      { timestamp: subDays(now, 48), amount: 50000, txId: randomTxId() },
      { timestamp: subDays(now, 18), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-Q3R4",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[6],
    status: "active",
    startedAt: subDays(now, 42),
    nextPaymentAt: addDays(now, 8),
    payments: [
      { timestamp: subDays(now, 42), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-S5T6",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[7],
    status: "cancelled",
    startedAt: subDays(now, 38),
    nextPaymentAt: subDays(now, 8),
    payments: [
      { timestamp: subDays(now, 38), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-U7V8",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[8],
    status: "active",
    startedAt: subDays(now, 35),
    nextPaymentAt: addDays(now, 6),
    payments: [
      { timestamp: subDays(now, 35), amount: 50000, txId: randomTxId() },
      { timestamp: subDays(now, 5), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-W9X0",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[9],
    status: "paused",
    startedAt: subDays(now, 30),
    nextPaymentAt: addDays(now, 4),
    payments: [
      { timestamp: subDays(now, 30), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-Y1Z2",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[10],
    status: "active",
    startedAt: subDays(now, 28),
    nextPaymentAt: addDays(now, 2),
    payments: [
      { timestamp: subDays(now, 28), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-A3B4",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[11],
    status: "active",
    startedAt: subDays(now, 22),
    nextPaymentAt: addDays(now, 9),
    payments: [
      { timestamp: subDays(now, 22), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-C5D6",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[12],
    status: "cancelled",
    startedAt: subDays(now, 18),
    nextPaymentAt: subDays(now, 3),
    payments: [
      { timestamp: subDays(now, 18), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-E7F8",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[13],
    status: "active",
    startedAt: subDays(now, 15),
    nextPaymentAt: addDays(now, 12),
    payments: [
      { timestamp: subDays(now, 15), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-G9H0",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[5],
    status: "active",
    startedAt: subDays(now, 12),
    nextPaymentAt: addDays(now, 15),
    payments: [
      { timestamp: subDays(now, 12), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-I1J2",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[6],
    status: "paused",
    startedAt: subDays(now, 10),
    nextPaymentAt: addDays(now, 7),
    payments: [
      { timestamp: subDays(now, 10), amount: 50000, txId: randomTxId() },
    ],
  },
  {
    id: "SUB-K3L4",
    planId: "PLAN-BA5C",
    payerAddress: payerAddrs[14],
    status: "active",
    startedAt: subDays(now, 7),
    nextPaymentAt: addDays(now, 20),
    payments: [
      { timestamp: subDays(now, 7), amount: 50000, txId: randomTxId() },
    ],
  },
];

export const useSubscriptionStore = create<SubscriptionStore>((set, get) => ({
  plans: seedPlans,
  subscribers: seedSubscribers,

  createPlan: (data) => {
    const plan: SubscriptionPlan = {
      ...data,
      id: generatePlanId(),
      merchantAddress: merchantAddr,
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
