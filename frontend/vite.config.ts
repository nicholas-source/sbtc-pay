import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — changes rarely, caches long
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          // Stacks SDK — large crypto libs
          "vendor-stacks": ["@stacks/connect", "@stacks/network", "@stacks/transactions"],
          // Charts — only used on dashboard + subscriptions pages
          "vendor-recharts": ["recharts"],
          // UI framework — Radix + utilities
          "vendor-ui": [
            "framer-motion",
            "class-variance-authority",
            "clsx",
            "tailwind-merge",
            "cmdk",
            "sonner",
          ],
          // Supabase client
          "vendor-supabase": ["@supabase/supabase-js"],
          // Date utilities
          "vendor-date": ["date-fns"],
          // Form handling
          "vendor-form": ["react-hook-form", "@hookform/resolvers", "zod"],
        },
      },
    },
  },
}));
