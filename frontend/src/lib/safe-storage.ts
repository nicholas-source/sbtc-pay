// localStorage access can *throw*, not just return null. Sandboxed iframes
// without allow-same-origin (a real path for embedded widgets), private-mode
// or "block site data" settings, storage-partitioned third-party contexts, and
// non-browser environments (tests/SSR) all throw a SecurityError or ReferenceError
// on access. These helpers degrade to a no-op so storage access can never turn
// into an uncaught error or crash module load.
export const safeStorage = {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* storage unavailable — ignore */
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      /* storage unavailable — ignore */
    }
  },
};
