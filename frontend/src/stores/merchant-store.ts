import { create } from 'zustand';
import { supabaseWithWallet } from "@/lib/supabase/client";
import { registerMerchant as registerMerchantOnChain, updateMerchantProfile as updateMerchantOnChain, getMerchant as getMerchantOnChain, waitForTransaction } from "@/lib/stacks/contract";
import { toast } from "sonner";

export interface MerchantProfile {
  id: string;
  name: string;
  description: string;
  logoUrl: string;
  webhookUrl: string;
  isVerified: boolean;
  isRegistered: boolean;
}

interface MerchantState {
  profile: MerchantProfile | null;
  isRegistering: boolean;
  isLoading: boolean;
  isUpdating: boolean;
  setProfile: (profile: MerchantProfile) => void;
  clearProfile: () => void;
  setRegistering: (v: boolean) => void;
  fetchMerchant: (principal: string) => Promise<void>;
  registerMerchant: (data: { name: string; description: string; logoUrl: string; webhookUrl: string }) => Promise<void>;
  updateProfile: (data: Partial<Pick<MerchantProfile, 'name' | 'description' | 'logoUrl' | 'webhookUrl'>>) => Promise<void>;
}

export const useMerchantStore = create<MerchantState>((set, get) => ({
  profile: null,
  isRegistering: false,
  isLoading: false,
  isUpdating: false,
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
      };
      set({ profile, isLoading: false });

      // Sync on-chain data → Supabase via RPC (bypasses RLS with SECURITY DEFINER)
      supabaseWithWallet(principal)
        .rpc('sync_merchant_cache', {
          p_id: onChain.id,
          p_principal: principal,
          p_name: onChain.name,
          p_description: onChain.description ?? null,
          p_logo_url: onChain.logoUrl ?? null,
          p_webhook_url: onChain.webhookUrl ?? null,
          p_is_active: onChain.isActive,
          p_is_verified: onChain.isVerified,
          p_registered_at: onChain.registeredAt,
        })
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
    if (get().isUpdating) return; // prevent double-submit
    set({ isUpdating: true });

    try {
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
    // Uses RPC to bypass RLS; needs numeric merchant ID, so look it up first
    supabaseWithWallet(current.id)
      .from('merchants')
      .select('id')
      .eq('principal', current.id)
      .maybeSingle()
      .then(({ data: merchant }) => {
        if (merchant) {
          supabaseWithWallet(current.id)
            .rpc('sync_merchant_cache', {
              p_id: merchant.id,
              p_principal: current.id,
              p_name: updated.name,
              p_description: updated.description || null,
              p_logo_url: updated.logoUrl || null,
              p_webhook_url: updated.webhookUrl || null,
            })
            .then(({ error }) => {
              if (error) console.warn('Supabase cache update failed:', error.message);
            });
        }
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
    } finally {
      set({ isUpdating: false });
    }
  },
}));
