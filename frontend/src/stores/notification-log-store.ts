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
  addLog: (entry: Omit<NotificationLogEntry, "id">) => void;
  clearLogs: () => void;
}

const MAX_LOGS = 50;

export const useNotificationLogStore = create<NotificationLogStore>((set) => ({
  logs: [],
  addLog: (entry) =>
    set((s) => ({
      logs: [{ ...entry, id: crypto.randomUUID() }, ...s.logs].slice(0, MAX_LOGS),
    })),
  clearLogs: () => set({ logs: [] }),
}));
