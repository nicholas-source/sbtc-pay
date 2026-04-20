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
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // WalletConnect / Reown — heaviest transitive dep, loaded with wallet
            if (id.includes("@walletconnect/") || id.includes("@reown/")) return "vendor-walletconnect";
            // Stacks SDK
            if (id.includes("@stacks/")) return "vendor-stacks";
            // React core — match exact package boundaries
            if (/node_modules\/(react-dom|react-router-dom|react-router|scheduler)\//.test(id)) return "vendor-react";
            if (/node_modules\/react\//.test(id)) return "vendor-react";
            // Charts — only dashboard
            if (id.includes("recharts") || id.includes("react-smooth")) return "vendor-recharts";
            // UI framework
            if (id.includes("framer-motion") || id.includes("class-variance-authority") || id.includes("clsx") || id.includes("tailwind-merge") || id.includes("cmdk") || id.includes("sonner") || id.includes("@radix-ui/")) return "vendor-ui";
            // Supabase
            if (id.includes("@supabase/")) return "vendor-supabase";
            // Date utilities
            if (id.includes("date-fns")) return "vendor-date";
            // Form handling
            if (id.includes("react-hook-form") || id.includes("@hookform/") || id.includes("/zod/")) return "vendor-form";
          }
        },
      },
    },
  },
}));
