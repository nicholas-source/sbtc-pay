import { create } from 'zustand';

export interface NotificationEvents {
  renewal: boolean;
  cancellation: boolean;
  failedPayment: boolean;
  newSubscriber: boolean;
  pauseResume: boolean;
}

export interface NotificationSettings {
  email: string;
  webhookUrl: string;
  events: NotificationEvents;
}

export const defaultNotificationSettings: NotificationSettings = {
  email: '',
  webhookUrl: '',
  events: {
    renewal: true,
    cancellation: true,
    failedPayment: true,
    newSubscriber: true,
    pauseResume: true,
  },
};

export interface MerchantProfile {
  id: string;
  name: string;
  description: string;
  logoUrl: string;
  webhookUrl: string;
  isVerified: boolean;
  isRegistered: boolean;
  notifications: NotificationSettings;
}

interface MerchantState {
  profile: MerchantProfile | null;
  isRegistering: boolean;
  setProfile: (profile: MerchantProfile) => void;
  clearProfile: () => void;
  setRegistering: (v: boolean) => void;
  registerMerchant: (data: { name: string; description: string; logoUrl: string; webhookUrl: string }) => Promise<void>;
  updateProfile: (data: Partial<Pick<MerchantProfile, 'name' | 'description' | 'logoUrl' | 'webhookUrl'>>) => Promise<void>;
  updateNotifications: (settings: NotificationSettings) => Promise<void>;
}

export const useMerchantStore = create<MerchantState>((set, get) => ({
  profile: null,
  isRegistering: false,
  setProfile: (profile) => set({ profile }),
  clearProfile: () => set({ profile: null }),
  setRegistering: (isRegistering) => set({ isRegistering }),
  registerMerchant: async (data) => {
    set({ isRegistering: true });
    // Simulate blockchain transaction delay
    await new Promise((r) => setTimeout(r, 2500));
    const profile: MerchantProfile = {
      id: `SP${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      name: data.name,
      description: data.description,
      logoUrl: data.logoUrl,
      webhookUrl: data.webhookUrl,
      isVerified: false,
      isRegistered: true,
      notifications: { ...defaultNotificationSettings },
    };
    set({ profile, isRegistering: false });
  },
  updateProfile: async (data) => {
    await new Promise((r) => setTimeout(r, 1000));
    const current = get().profile;
    if (current) {
      set({ profile: { ...current, ...data } });
    }
  },
  updateNotifications: async (settings) => {
    await new Promise((r) => setTimeout(r, 500));
    const current = get().profile;
    if (current) {
      set({ profile: { ...current, notifications: settings } });
    }
  },
}));
