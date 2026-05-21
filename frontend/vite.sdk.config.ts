import { defineConfig } from "vite";
import path from "path";

// Builds the public Widget SDK as a single self-contained IIFE bundle that
// merchants load via <script src="https://sbtc-pay.com/sbtcpay.js" async>.
// Output goes into public/ so the main app build picks it up as a static
// asset served from the same origin as the widget routes.

export default defineConfig({
  // No publicDir copy — this build only emits the SDK file. The main app
  // build still uses public/ as the static-asset root.
  publicDir: false,
  build: {
    target: "es2018",
    minify: "esbuild",
    sourcemap: true,
    emptyOutDir: false,
    outDir: "public",
    lib: {
      entry: path.resolve(__dirname, "src/widget-sdk/index.ts"),
      name: "SBTCPay",
      formats: ["iife"],
      fileName: () => "sbtcpay.js",
    },
    rollupOptions: {
      output: {
        // Single file, no chunk splitting, no externals
        inlineDynamicImports: true,
        extend: true,
        exports: "named",
      },
    },
  },
});
