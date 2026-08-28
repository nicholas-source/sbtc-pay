import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    // src/lib/supabase/auth.ts throws at module scope when these are unset, and
    // src/lib/supabase/client.ts imports it — so importing any store that
    // touches Supabase fails before a single assertion runs. Locally that was
    // masked by a gitignored .env; CI has no .env, so invoice-store and
    // merchant-store failed there while passing on every developer machine.
    //
    // These are deliberately fake. Nothing in the suite makes a network call —
    // the values only need to be present and well-formed enough for
    // createClient() to construct. Do not put real credentials here.
    env: {
      VITE_SUPABASE_URL: "https://placeholder.supabase.co",
      VITE_SUPABASE_ANON_KEY: "placeholder-anon-key-not-a-real-credential",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
