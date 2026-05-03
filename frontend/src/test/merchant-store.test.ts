import { describe, it, expect, beforeEach, vi } from "vitest";
import { useMerchantStore } from "@/stores/merchant-store";

// Mock contract calls so store tests don't need a wallet/network
vi.mock("@/lib/stacks/contract", () => ({
  registerMerchant: vi.fn().mockResolvedValue({ txId: "mock-tx-register" }),
  updateMerchantProfile: vi.fn().mockResolvedValue({ txId: "mock-tx-update" }),
  getMerchant: vi.fn().mockResolvedValue(null),
  waitForTransaction: vi.fn().mockResolvedValue({ status: "success" }),
}));

beforeEach(() => {
  useMerchantStore.setState({ profile: null, isRegistering: false, isLoading: false });
});

describe("merchant-store", () => {
  describe("setProfile", () => {
    it("sets the merchant profile", () => {
      const { setProfile } = useMerchantStore.getState();
      setProfile({
        id: "ST123",
        name: "Test Merchant",
        description: "A test merchant",
        logoUrl: "",
        webhookUrl: "",
        isVerified: false,
        isRegistered: true,
      });

      const { profile } = useMerchantStore.getState();
      expect(profile).not.toBeNull();
      expect(profile!.name).toBe("Test Merchant");
      expect(profile!.isRegistered).toBe(true);
    });
  });

  describe("clearProfile", () => {
    it("clears the merchant profile", () => {
      const { setProfile, clearProfile } = useMerchantStore.getState();
      setProfile({
        id: "ST123",
        name: "Test",
        description: "",
        logoUrl: "",
        webhookUrl: "",
        isVerified: false,
        isRegistered: true,
      });

      clearProfile();
      expect(useMerchantStore.getState().profile).toBeNull();
    });
  });

  describe("updateProfile", () => {
    it("updates partial profile fields", async () => {
      const { setProfile, updateProfile } = useMerchantStore.getState();
      setProfile({
        id: "ST123",
        name: "Old Name",
        description: "Old desc",
        logoUrl: "",
        webhookUrl: "",
        isVerified: false,
        isRegistered: true,
      });

      await updateProfile({ name: "New Name" });

      const { profile } = useMerchantStore.getState();
      expect(profile!.name).toBe("New Name");
      expect(profile!.description).toBe("Old desc"); // unchanged
    });

    it("does nothing when no profile exists", () => {
      const { updateProfile } = useMerchantStore.getState();
      updateProfile({ name: "No-op" });
      expect(useMerchantStore.getState().profile).toBeNull();
    });
  });

  describe("setRegistering", () => {
    it("toggles the registering flag", () => {
      const { setRegistering } = useMerchantStore.getState();

      setRegistering(true);
      expect(useMerchantStore.getState().isRegistering).toBe(true);

      setRegistering(false);
      expect(useMerchantStore.getState().isRegistering).toBe(false);
    });
  });
});
