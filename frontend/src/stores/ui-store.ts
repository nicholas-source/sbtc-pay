import { create } from 'zustand';

interface UIState {
  sidebarOpen: boolean;
  walletModalOpen: boolean;
  createInvoiceOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  setWalletModalOpen: (open: boolean) => void;
  setCreateInvoiceOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: typeof window !== 'undefined' ? window.innerWidth >= 1024 : true,
  walletModalOpen: false,
  createInvoiceOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  setWalletModalOpen: (walletModalOpen) => set({ walletModalOpen }),
  setCreateInvoiceOpen: (createInvoiceOpen) => set({ createInvoiceOpen }),
}));
