import { create } from 'zustand';
import { supabaseWithWallet } from "@/lib/supabase/client";
import { registerMerchant as registerMerchantOnChain, updateMerchantProfile as updateMerchantOnChain, getMerchant as getMerchantOnChain, waitForTransaction } from "@/lib/stacks/contract";
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
      // On-chain contract is the SOLE source of truth for core merchant fields.
      // The contract's merchant-updated event does not include updated field values,
      // so chainhook cannot keep Supabase in sync — we always read on-chain.
      const onChain = await getMerchantOnChain(principal);

      if (!onChain) {
        set({ profile: null, isLoading: false });
        return;
      }

      const profile: MerchantProfile = {
        id: principal,
        name: onChain.name,
        description: onChain.description ?? '',
        logoUrl: onChain.logoUrl ?? '',
        webhookUrl: onChain.webhookUrl ?? '',
        isVerified: onChain.isVerified,
        isRegistered: true,
        notifications: { ...defaultNotificationSettings },
      };
      set({ profile, isLoading: false });

      // Sync on-chain data → Supabase so invoice backfill and other queries find the merchant
      supabaseWithWallet(principal)
        .from('merchants')
        .upsert({
          id: onChain.id,
          principal,
          name: onChain.name,
          description: onChain.description,
          logo_url: onChain.logoUrl,
          webhook_url: onChain.webhookUrl,
          is_active: onChain.isActive,
          is_verified: onChain.isVerified,
          registered_at: onChain.registeredAt,
        }, { onConflict: 'id' })
        .then(({ error }) => {
          if (error) console.warn('merchant cache sync failed:', error.message);
        });
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

    // Optimistic local update
    set({ profile: updated });

    // Also write directly to Supabase cache (contract event lacks field data)
    supabaseWithWallet(current.id)
      .from('merchants')
      .update({
        name: updated.name,
        description: updated.description || null,
        logo_url: updated.logoUrl || null,
        webhook_url: updated.webhookUrl || null,
      })
      .eq('principal', current.id)
      .then(({ error }) => {
        if (error) console.warn('Supabase cache update failed:', error.message);
      });

    // After tx confirms, re-read on-chain to ensure local state is accurate
    waitForTransaction(txId, 60, 10000).then(async (result) => {
      if (result.status === 'success' && current.id) {
        const fresh = await getMerchantOnChain(current.id);
        if (fresh) {
          set({
            profile: {
              ...get().profile!,
              name: fresh.name,
              description: fresh.description ?? '',
              logoUrl: fresh.logoUrl ?? '',
              webhookUrl: fresh.webhookUrl ?? '',
              isVerified: fresh.isVerified,
            },
          });
          toast.success("Profile update confirmed on-chain!");
        }
      } else if (result.status === 'failed') {
        toast.error("Profile update failed on-chain");
        // Revert to on-chain state
        const reverted = await getMerchantOnChain(current.id);
        if (reverted) {
          set({
            profile: {
              ...get().profile!,
              name: reverted.name,
              description: reverted.description ?? '',
              logoUrl: reverted.logoUrl ?? '',
              webhookUrl: reverted.webhookUrl ?? '',
            },
          });
        }
      }
    });
  },

  updateNotifications: async (settings) => {
    const current = get().profile;
    if (current) {
      set({ profile: { ...current, notifications: settings } });
    }
  },
}));
