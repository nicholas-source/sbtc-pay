import { create } from "zustand";

export type NotifEventKey = "renewal" | "cancellation" | "failedPayment" | "newSubscriber" | "pauseResume";

export interface NotificationLogEntry {
  id: string;
  eventType: NotifEventKey;
  label: string;
  timestamp: Date;
  channel: "email" | "webhook" | "both";
}

interface NotificationLogStore {
  logs: NotificationLogEntry[];
  merchantKey: string | null;
  addLog: (entry: Omit<NotificationLogEntry, "id">) => void;
  clearLogs: () => void;
  /** Load persisted logs for the active merchant */
  loadForMerchant: (merchantAddress: string) => void;
}

const MAX_LOGS = 50;
const STORAGE_PREFIX = "sbtc-pay-notif-logs-";

function persistLogs(merchantKey: string | null, logs: NotificationLogEntry[]) {
  if (!merchantKey) return;
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${merchantKey}`, JSON.stringify(logs));
  } catch { /* quota exceeded — silently skip */ }
}

function loadLogs(merchantKey: string): NotificationLogEntry[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${merchantKey}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as NotificationLogEntry[];
    return parsed.map((e) => ({ ...e, timestamp: new Date(e.timestamp) }));
  } catch {
    return [];
  }
}

export const useNotificationLogStore = create<NotificationLogStore>((set, get) => ({
  logs: [],
  merchantKey: null,

  loadForMerchant: (merchantAddress) => {
    const logs = loadLogs(merchantAddress);
    set({ logs, merchantKey: merchantAddress });
  },

  addLog: (entry) =>
    set((s) => {
      const logs = [{ ...entry, id: crypto.randomUUID() }, ...s.logs].slice(0, MAX_LOGS);
      persistLogs(s.merchantKey, logs);
      return { logs };
    }),

  clearLogs: () => {
    const key = get().merchantKey;
    if (key) {
      try { localStorage.removeItem(`${STORAGE_PREFIX}${key}`); } catch { /* ignore */ }
    }
    set({ logs: [] });
  },
}));
