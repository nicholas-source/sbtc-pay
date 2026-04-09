import { create } from 'zustand';
import { supabaseWithWallet } from "@/lib/supabase/client";
import { registerMerchant as registerMerchantOnChain, updateMerchantProfile as updateMerchantOnChain } from "@/lib/stacks/contract";
import { toast } from "sonner";

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
  isLoading: boolean;
  setProfile: (profile: MerchantProfile) => void;
  clearProfile: () => void;
  setRegistering: (v: boolean) => void;
  fetchMerchant: (principal: string) => Promise<void>;
  registerMerchant: (data: { name: string; description: string; logoUrl: string; webhookUrl: string }) => Promise<void>;
  updateProfile: (data: Partial<Pick<MerchantProfile, 'name' | 'description' | 'logoUrl' | 'webhookUrl'>>) => Promise<void>;
  updateNotifications: (settings: NotificationSettings) => Promise<void>;
}

export const useMerchantStore = create<MerchantState>((set, get) => ({
  profile: null,
  isRegistering: false,
  isLoading: false,
  setProfile: (profile) => set({ profile }),
  clearProfile: () => set({ profile: null }),
  setRegistering: (isRegistering) => set({ isRegistering }),

  fetchMerchant: async (principal) => {
    set({ isLoading: true });
    try {
      const { data, error } = await supabaseWithWallet(principal)
        .from('merchants')
        .select('*')
        .eq('principal', principal)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const profile: MerchantProfile = {
          id: data.principal,
          name: data.name,
          description: data.description || '',
          logoUrl: data.logo_url || '',
          webhookUrl: data.webhook_url || '',
          isVerified: data.is_verified,
          isRegistered: true,
          notifications: { ...defaultNotificationSettings },
        };
        set({ profile, isLoading: false });
      } else {
        set({ profile: null, isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  registerMerchant: async (data) => {
    set({ isRegistering: true });
    try {
      toast.info("Please confirm the transaction in your wallet");
      const { txId } = await registerMerchantOnChain({
        name: data.name,
        description: data.description || undefined,
        webhookUrl: data.webhookUrl || undefined,
        logoUrl: data.logoUrl || undefined,
      });

      toast.success("Registration submitted!", { description: "Waiting for on-chain confirmation..." });

      // Optimistic profile while chainhook indexes
      const profile: MerchantProfile = {
        id: txId,
        name: data.name,
        description: data.description,
        logoUrl: data.logoUrl,
        webhookUrl: data.webhookUrl,
        isVerified: false,
        isRegistered: true,
        notifications: { ...defaultNotificationSettings },
      };
      set({ profile, isRegistering: false });
    } catch (error) {
      set({ isRegistering: false });
      const message = error instanceof Error ? error.message : "Registration failed";
      throw new Error(message);
    }
  },

  updateProfile: async (data) => {
    const current = get().profile;
    if (!current) return;

    const updated = { ...current, ...data };

    toast.info("Please confirm the transaction in your wallet");
    const { txId } = await updateMerchantOnChain({
      name: updated.name,
      description: updated.description || undefined,
      webhookUrl: updated.webhookUrl || undefined,
      logoUrl: updated.logoUrl || undefined,
    });

    toast.success("Profile update submitted!", { description: `TX: ${txId.slice(0, 12)}...` });

    // Optimistic local update while chainhook indexes
    set({ profile: updated });
  },

  updateNotifications: async (settings) => {
    const current = get().profile;
    if (current) {
      set({ profile: { ...current, notifications: settings } });
    }
  },
}));
