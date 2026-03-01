import { create } from "zustand";
import { subDays, subHours, addDays, addHours } from "date-fns";

export type InvoiceStatus = "pending" | "partial" | "paid" | "expired" | "cancelled" | "refunded";

export interface Payment {
  timestamp: Date;
  amount: number;
  txId: string;
}

export interface Refund {
  timestamp: Date;
  amount: number;
  reason: string;
  txId: string;
}

export interface Invoice {
  id: string;
  amount: number;
  amountPaid: number;
  memo: string;
  referenceId: string;
  status: InvoiceStatus;
  allowPartial: boolean;
  allowOverpay: boolean;
  merchantAddress: string;
  payerAddress: string;
  createdAt: Date;
  expiresAt: Date | null;
  payments: Payment[];
  refunds: Refund[];
}

interface CreateInvoiceData {
  amount: number;
  memo?: string;
  referenceId?: string;
  expiresAt?: Date | null;
  allowPartial?: boolean;
  allowOverpay?: boolean;
}

interface InvoiceStore {
  invoices: Invoice[];
  createInvoice: (data: CreateInvoiceData) => Invoice;
  updateInvoice: (id: string, data: Partial<Pick<Invoice, "memo" | "amount" | "referenceId">>) => void;
  cancelInvoice: (id: string) => void;
  refundInvoice: (id: string, amount: number, reason: string) => boolean;
  getInvoice: (id: string) => Invoice | undefined;
  simulatePayment: (id: string, amount: number) => Payment | null;
}

function generateId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 4; i++) result += chars[Math.floor(Math.random() * chars.length)];
  return `INV-${result}`;
}

function randomTxId(): string {
  const hex = "0123456789abcdef";
  let r = "0x";
  for (let i = 0; i < 40; i++) r += hex[Math.floor(Math.random() * 16)];
  return r;
}

const merchantAddr = "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7";
const payerAddrs = [
  "SP1HTBVD3JG9C05J7HBJTHGR0GGW7KXW28M5JS8QE",
  "SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE",
  "SP2C2YFP12AJZB1MAEP5RQHWER4NKFF4J5XFGYW7P",
];

const now = new Date();

const seedInvoices: Invoice[] = [
  // Paid invoices
  ...[
    { memo: "Website redesign deposit", amount: 2500000, days: 25 },
    { memo: "Monthly hosting - January", amount: 150000, days: 20 },
    { memo: "API usage Q4 2025", amount: 4200000, days: 18 },
    { memo: "Consulting session", amount: 500000, days: 12 },
    { memo: "Logo design final", amount: 750000, days: 8 },
  ].map((d, i) => {
    const created = subDays(now, d.days);
    return {
      id: `INV-P${String(i + 1).padStart(2, "0")}D`,
      amount: d.amount,
      amountPaid: d.amount,
      memo: d.memo,
      referenceId: `REF-${1000 + i}`,
      status: "paid" as InvoiceStatus,
      allowPartial: false,
      allowOverpay: false,
      merchantAddress: merchantAddr,
      payerAddress: payerAddrs[i % payerAddrs.length],
      createdAt: created,
      expiresAt: addDays(created, 30),
      payments: [{ timestamp: subDays(now, d.days - 2), amount: d.amount, txId: randomTxId() }],
      refunds: i === 1
        ? [{ timestamp: subDays(now, d.days - 5), amount: 50000, reason: "Customer request", txId: randomTxId() }]
        : i === 3
        ? [{ timestamp: subDays(now, d.days - 4), amount: d.amount, reason: "Duplicate payment", txId: randomTxId() }]
        : [],
    };
  }),
  // Pending invoices
  ...[
    { memo: "Mobile app prototype", amount: 3500000, days: 3 },
    { memo: "SEO audit report", amount: 800000, days: 2 },
    { memo: "Database migration", amount: 1200000, days: 1 },
    { memo: "Newsletter integration", amount: 350000, hours: 6 },
    { memo: "Analytics dashboard", amount: 2800000, hours: 2 },
  ].map((d, i) => {
    const created = "hours" in d ? subHours(now, d.hours!) : subDays(now, d.days!);
    return {
      id: `INV-N${String(i + 1).padStart(2, "0")}G`,
      amount: d.amount,
      amountPaid: 0,
      memo: d.memo,
      referenceId: i % 2 === 0 ? `REF-${2000 + i}` : "",
      status: "pending" as InvoiceStatus,
      allowPartial: i % 2 === 0,
      allowOverpay: false,
      merchantAddress: merchantAddr,
      payerAddress: "",
      createdAt: created,
      expiresAt: addDays(created, 7),
      payments: [],
      refunds: [],
    };
  }),
  // Partial invoices
  ...[
    { memo: "E-commerce platform build", amount: 5000000, paid: 2000000, days: 15 },
    { memo: "Brand identity package", amount: 1800000, paid: 900000, days: 10 },
    { memo: "Security audit Phase 1", amount: 3200000, paid: 1600000, days: 5 },
  ].map((d, i) => {
    const created = subDays(now, d.days);
    const payCount = i + 1;
    const perPayment = Math.floor(d.paid / payCount);
    return {
      id: `INV-R${String(i + 1).padStart(2, "0")}T`,
      amount: d.amount,
      amountPaid: d.paid,
      memo: d.memo,
      referenceId: `REF-${3000 + i}`,
      status: "partial" as InvoiceStatus,
      allowPartial: true,
      allowOverpay: false,
      merchantAddress: merchantAddr,
      payerAddress: payerAddrs[i % payerAddrs.length],
      createdAt: created,
      expiresAt: addDays(created, 30),
      payments: Array.from({ length: payCount }, (_, j) => ({
        timestamp: subDays(now, d.days - (j + 1) * 2),
        amount: perPayment,
        txId: randomTxId(),
      })),
      refunds: [],
    };
  }),
  // Expired invoices
  ...[
    { memo: "Old project estimate", amount: 900000, days: 28 },
    { memo: "Trial subscription", amount: 50000, days: 22 },
  ].map((d, i) => {
    const created = subDays(now, d.days);
    return {
      id: `INV-X${String(i + 1).padStart(2, "0")}E`,
      amount: d.amount,
      amountPaid: 0,
      memo: d.memo,
      referenceId: "",
      status: "expired" as InvoiceStatus,
      allowPartial: false,
      allowOverpay: false,
      merchantAddress: merchantAddr,
      payerAddress: "",
      createdAt: created,
      expiresAt: subDays(now, d.days - 7),
      payments: [],
      refunds: [],
    };
  }),
  // Cancelled invoices
  ...[
    { memo: "Cancelled project scope", amount: 1500000, days: 14 },
    { memo: "Duplicate invoice", amount: 750000, days: 9 },
  ].map((d, i) => {
    const created = subDays(now, d.days);
    return {
      id: `INV-C${String(i + 1).padStart(2, "0")}L`,
      amount: d.amount,
      amountPaid: 0,
      memo: d.memo,
      referenceId: "",
      status: "cancelled" as InvoiceStatus,
      allowPartial: false,
      allowOverpay: false,
      merchantAddress: merchantAddr,
      payerAddress: "",
      createdAt: created,
      expiresAt: null,
      payments: [],
      refunds: [],
    };
  }),
];

export const useInvoiceStore = create<InvoiceStore>((set, get) => ({
  invoices: seedInvoices,

  createInvoice: (data) => {
    const invoice: Invoice = {
      id: generateId(),
      amount: data.amount,
      amountPaid: 0,
      memo: data.memo || "",
      referenceId: data.referenceId || "",
      status: "pending",
      allowPartial: data.allowPartial ?? false,
      allowOverpay: data.allowOverpay ?? false,
      merchantAddress: merchantAddr,
      payerAddress: "",
      createdAt: new Date(),
      expiresAt: data.expiresAt ?? null,
      payments: [],
      refunds: [],
    };
    set((state) => ({ invoices: [invoice, ...state.invoices] }));
    return invoice;
  },

  updateInvoice: (id, data) => {
    set((state) => ({
      invoices: state.invoices.map((inv) => (inv.id === id ? { ...inv, ...data } : inv)),
    }));
  },

  cancelInvoice: (id) => {
    set((state) => ({
      invoices: state.invoices.map((inv) =>
        inv.id === id ? { ...inv, status: "cancelled" as InvoiceStatus } : inv
      ),
    }));
  },

  refundInvoice: (id, amount, reason) => {
    const invoice = get().invoices.find((inv) => inv.id === id);
    if (!invoice || amount <= 0 || amount > invoice.amountPaid) return false;

    const refund: Refund = {
      timestamp: new Date(),
      amount,
      reason,
      txId: randomTxId(),
    };

    set((state) => ({
      invoices: state.invoices.map((inv) => {
        if (inv.id !== id) return inv;
        const newPaid = inv.amountPaid - amount;
        const newStatus: InvoiceStatus =
          newPaid <= 0 ? "refunded" : newPaid < inv.amount ? "partial" : inv.status;
        return {
          ...inv,
          amountPaid: Math.max(0, newPaid),
          status: newStatus,
          refunds: [...inv.refunds, refund],
        };
      }),
    }));
    return true;
  },

  getInvoice: (id) => get().invoices.find((inv) => inv.id === id),

  simulatePayment: (id, amount) => {
    const invoice = get().invoices.find((inv) => inv.id === id);
    if (!invoice || amount <= 0) return null;
    if (invoice.status !== "pending" && invoice.status !== "partial") return null;

    const payment: Payment = {
      timestamp: new Date(),
      amount,
      txId: randomTxId(),
    };

    set((state) => ({
      invoices: state.invoices.map((inv) => {
        if (inv.id !== id) return inv;
        const newPaid = inv.amountPaid + amount;
        const newStatus: InvoiceStatus = newPaid >= inv.amount ? "paid" : "partial";
        return {
          ...inv,
          amountPaid: newPaid,
          status: newStatus,
          payerAddress: inv.payerAddress || "SP2J6ZY48GV1EZ5V2V5RB9MP66SW86PYKKNRV9EJ7",
          payments: [...inv.payments, payment],
        };
      }),
    }));

    return payment;
  },
}));
