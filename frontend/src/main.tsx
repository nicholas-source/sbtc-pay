import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// ── Contract version migration ──────────────────────────────────────
// When the contract version changes, stale localStorage data (optimistic
// invoices, notification logs/settings, wallet cache) becomes invalid.
// This clears it automatically so users don't have to manually wipe site data.
const APP_VERSION_KEY = "sbtc-pay-version";
const CURRENT_VERSION = "payment-v5"; // bump this on each contract migration

const storedVersion = localStorage.getItem(APP_VERSION_KEY);
if (storedVersion !== CURRENT_VERSION) {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith("sbtc-pay-")) keysToRemove.push(key);
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  localStorage.setItem(APP_VERSION_KEY, CURRENT_VERSION);
  console.info(`[sBTC Pay] Migrated from ${storedVersion ?? "none"} → ${CURRENT_VERSION}, cleared ${keysToRemove.length} stale keys`);
}
// ─────────────────────────────────────────────────────────────────────

createRoot(document.getElementById("root")!).render(<App />);
