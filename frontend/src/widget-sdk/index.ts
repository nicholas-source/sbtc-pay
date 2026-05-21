// sBTC Pay public Widget SDK
// Loaded by merchants via <script src="https://sbtc-pay.com/sbtcpay.js" async></script>.
// Scans the DOM for [data-sbtcpay="invoice|direct|subscribe"] elements, renders a
// styled Pay button on each, and on click opens a modal that hosts the existing
// widget route in an iframe. Listens for postMessage events from the iframe to
// fire success/error/close callbacks back to the host page.

type Mode = "invoice" | "direct" | "subscribe";

export type SBTCPayOpenOptions = {
  mode: Mode;
  invoiceId?: string | number;
  merchant?: string;
  amount?: string | number; // base units; matches the widget URL contract
  token?: "sbtc" | "stx";
  memo?: string;
  plan?: string;
  interval?: "daily" | "weekly" | "biweekly" | "monthly" | "quarterly" | "yearly";
  theme?: "dark" | "light";
  onSuccess?: (result: { txId: string; invoiceId?: number; mode: Mode }) => void;
  onError?: (err: { message: string }) => void;
  onClose?: () => void;
};

declare global {
  interface Window {
    SBTCPay?: typeof SBTCPay;
  }
}

// Resolve the origin to embed from. Prefer the script's own src so a script
// pulled from testnet.sbtc-pay.com opens the testnet widget, not mainnet.
function resolveBase(): string {
  try {
    const current = document.currentScript as HTMLScriptElement | null;
    if (current?.src) return new URL(current.src).origin;
    const all = Array.from(document.scripts);
    const match = all.find((s) => /\/sbtcpay(\.[\w-]+)?\.js(\?|$)/.test(s.src));
    if (match?.src) return new URL(match.src).origin;
  } catch {
    /* fall through */
  }
  return "https://sbtc-pay.com";
}

const BASE = resolveBase();

function buildWidgetUrl(opts: SBTCPayOpenOptions): string {
  const params = new URLSearchParams();
  if (opts.amount !== undefined) params.set("amount", String(opts.amount));
  if (opts.token) params.set("token", opts.token);
  if (opts.memo) params.set("memo", opts.memo);
  if (opts.plan) params.set("plan", opts.plan);
  if (opts.interval) params.set("interval", opts.interval);
  if (opts.theme) params.set("theme", opts.theme);
  params.set("embed", "sdk");

  const qs = params.toString();
  const tail = qs ? `?${qs}` : "";
  switch (opts.mode) {
    case "invoice": {
      const id = String(opts.invoiceId ?? "").replace(/^INV-/i, "").trim();
      return `${BASE}/widget/invoice/${encodeURIComponent(id)}${tail}`;
    }
    case "direct":
      return `${BASE}/widget/${encodeURIComponent(opts.merchant ?? "")}${tail}`;
    case "subscribe":
      return `${BASE}/widget/subscribe/${encodeURIComponent(opts.merchant ?? "")}${tail}`;
  }
}

// Single style block, idempotent. All selectors prefixed sbtcpay- so they
// cannot collide with the host page. Modal uses fixed positioning + own
// stacking context.
function injectStyles() {
  if (document.getElementById("sbtcpay-sdk-styles")) return;
  const css = `
    .sbtcpay-btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px 16px; min-height: 40px;
      background: #f5841f; color: #fff;
      border: 0; border-radius: 8px;
      font: 600 14px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      cursor: pointer; transition: background 120ms, transform 120ms;
      box-shadow: 0 1px 2px rgba(0,0,0,.06);
    }
    .sbtcpay-btn:hover { background: #e0741a; }
    .sbtcpay-btn:active { transform: translateY(1px); }
    .sbtcpay-btn:focus-visible { outline: 2px solid #f5841f; outline-offset: 2px; }
    .sbtcpay-btn[disabled] { opacity: .6; cursor: not-allowed; }
    .sbtcpay-btn-icon { width: 16px; height: 16px; flex: 0 0 16px; }

    .sbtcpay-backdrop {
      position: fixed; inset: 0; z-index: 2147483600;
      background: rgba(8, 10, 14, .72);
      display: flex; align-items: center; justify-content: center;
      padding: 16px;
      animation: sbtcpay-fade-in 160ms ease-out;
    }
    .sbtcpay-modal {
      position: relative; width: 100%; max-width: 420px;
      background: transparent; border-radius: 16px;
      box-shadow: 0 24px 60px rgba(0,0,0,.45);
      animation: sbtcpay-pop 200ms cubic-bezier(.16,1,.3,1);
    }
    .sbtcpay-iframe {
      display: block; width: 100%; height: 620px; max-height: calc(100vh - 64px);
      border: 0; border-radius: 16px; background: #0c0c0d;
    }
    .sbtcpay-close {
      position: absolute; top: -14px; right: -14px;
      width: 32px; height: 32px; border-radius: 999px;
      background: #fff; color: #111; border: 0;
      display: inline-flex; align-items: center; justify-content: center;
      cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,.25);
      font: 600 16px/1 -apple-system, sans-serif;
    }
    .sbtcpay-close:hover { background: #f5f5f5; }
    .sbtcpay-close:focus-visible { outline: 2px solid #f5841f; outline-offset: 2px; }

    @keyframes sbtcpay-fade-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes sbtcpay-pop {
      from { opacity: 0; transform: translateY(8px) scale(.98); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @media (max-width: 480px) {
      .sbtcpay-modal { max-width: 100%; }
      .sbtcpay-iframe { height: calc(100vh - 64px); border-radius: 12px; }
      .sbtcpay-close { top: 8px; right: 8px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .sbtcpay-backdrop, .sbtcpay-modal { animation: none; }
    }
  `;
  const style = document.createElement("style");
  style.id = "sbtcpay-sdk-styles";
  style.textContent = css;
  document.head.appendChild(style);
}

// Small inline SVG (no external font/icon dep)
function btcIconSvg(): string {
  return `<svg class="sbtcpay-btn-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M11.767 19.089c4.924.868 9.593-2.395 10.461-7.317.868-4.924-2.395-9.593-7.317-10.461C9.987.443 5.318 3.706 4.45 8.629c-.868 4.922 2.396 9.592 7.317 10.46zM12.93 7.21c.88.155 1.84.604 1.677 1.522l-.094.534c.728.236 1.218.711 1.027 1.788-.273 1.547-1.464 1.51-3.052 1.34l-.155.876.881.156-.094.534-.881-.155-.193 1.094-.524-.092.193-1.094-.42-.074-.193 1.093-.527-.093.194-1.097-1.057-.187.262-.633s.394.07.388.062c.151.027.219-.07.246-.135l.305-1.734c.025 0 .057-.005.094-.001-.014-.005-.027-.01-.041-.013-.024 0-.043 0-.062-.001l.219-1.236c.005-.105-.026-.236-.225-.27.008-.006-.394-.07-.394-.07l.108-.59 1.121.198-.196 1.107.527.092.196-1.108.524.092-.196 1.106zm-.4 3.93c.4.071 1.275.226 1.428-.642.157-.886-.692-1.012-1.106-1.073-.046-.007-.087-.013-.122-.019l-.279 1.581c.029.005.06.012.094.018l-.015.135zm.353-2.001c.334.06 1.066.189 1.207-.601.143-.81-.564-.913-.91-.964l-.103-.018-.253 1.432c.022.038.043.047.06.05z" fill="currentColor"/></svg>`;
}

let activeModal: { cleanup: () => void } | null = null;

function open(opts: SBTCPayOpenOptions): { close: () => void } {
  injectStyles();

  // Only one modal at a time. If one is open, close it before opening a new one.
  if (activeModal) activeModal.cleanup();

  const url = buildWidgetUrl(opts);

  const backdrop = document.createElement("div");
  backdrop.className = "sbtcpay-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-label", "sBTC Pay payment");

  const modal = document.createElement("div");
  modal.className = "sbtcpay-modal";

  const iframe = document.createElement("iframe");
  iframe.className = "sbtcpay-iframe";
  iframe.src = url;
  iframe.title = "sBTC Pay";
  iframe.allow = "clipboard-write";
  iframe.setAttribute("loading", "lazy");

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "sbtcpay-close";
  closeBtn.setAttribute("aria-label", "Close payment dialog");
  closeBtn.textContent = "✕";

  modal.appendChild(iframe);
  modal.appendChild(closeBtn);
  backdrop.appendChild(modal);

  // Lock scroll on host body while modal is open
  const prevOverflow = document.body.style.overflow;
  document.body.style.overflow = "hidden";
  document.body.appendChild(backdrop);

  let closed = false;
  const cleanup = () => {
    if (closed) return;
    closed = true;
    window.removeEventListener("message", onMessage);
    document.removeEventListener("keydown", onKeydown);
    document.body.style.overflow = prevOverflow;
    backdrop.remove();
    activeModal = null;
    try { opts.onClose?.(); } catch { /* host callback error — swallow */ }
  };

  const onMessage = (ev: MessageEvent) => {
    // Strict origin check — only accept messages from the widget origin
    if (ev.origin !== BASE) return;
    if (ev.source !== iframe.contentWindow) return;
    const data = ev.data;
    if (!data || typeof data !== "object" || typeof data.type !== "string") return;
    if (!data.type.startsWith("sbtcpay:")) return;

    switch (data.type) {
      case "sbtcpay:ready":
        // Widget mounted inside iframe — could hide a loading shimmer here
        break;
      case "sbtcpay:payment_submitted":
      case "sbtcpay:subscription_created":
        try {
          opts.onSuccess?.({
            txId: String(data.txId ?? ""),
            invoiceId: typeof data.invoiceId === "number" ? data.invoiceId : undefined,
            mode: opts.mode,
          });
        } catch { /* swallow host errors */ }
        // Give the user a beat to see the success screen, then close
        setTimeout(cleanup, 2200);
        break;
      case "sbtcpay:error":
        try { opts.onError?.({ message: String(data.message ?? "Payment failed") }); } catch { /* */ }
        break;
      case "sbtcpay:close":
        cleanup();
        break;
    }
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === "Escape") cleanup();
  };

  closeBtn.addEventListener("click", cleanup);
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) cleanup(); });
  window.addEventListener("message", onMessage);
  document.addEventListener("keydown", onKeydown);

  // Focus management — move focus into the modal for screen readers
  setTimeout(() => closeBtn.focus(), 50);

  activeModal = { cleanup };
  return { close: cleanup };
}

function readDataset(el: HTMLElement): SBTCPayOpenOptions | null {
  const mode = el.dataset.sbtcpay as Mode | undefined;
  if (mode !== "invoice" && mode !== "direct" && mode !== "subscribe") return null;

  const opts: SBTCPayOpenOptions = { mode };
  const ds = el.dataset;
  if (ds.sbtcpayInvoice) opts.invoiceId = ds.sbtcpayInvoice;
  if (ds.sbtcpayMerchant) opts.merchant = ds.sbtcpayMerchant;
  if (ds.sbtcpayAmount) opts.amount = ds.sbtcpayAmount;
  if (ds.sbtcpayToken === "sbtc" || ds.sbtcpayToken === "stx") opts.token = ds.sbtcpayToken;
  if (ds.sbtcpayMemo) opts.memo = ds.sbtcpayMemo;
  if (ds.sbtcpayPlan) opts.plan = ds.sbtcpayPlan;
  if (ds.sbtcpayInterval) opts.interval = ds.sbtcpayInterval as SBTCPayOpenOptions["interval"];
  if (ds.sbtcpayTheme === "dark" || ds.sbtcpayTheme === "light") opts.theme = ds.sbtcpayTheme;
  return opts;
}

function mount(el: HTMLElement) {
  if (el.dataset.sbtcpayMounted === "true") return;
  const opts = readDataset(el);
  if (!opts) return;

  const labelOverride = el.dataset.sbtcpayLabel;
  const isClickable = el.tagName === "BUTTON" || el.tagName === "A";

  if (isClickable) {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      open(opts);
    });
  } else {
    // Container — inject a styled button inside
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sbtcpay-btn";
    const label = labelOverride || defaultLabel(opts);
    btn.innerHTML = `${btcIconSvg()}<span>${escapeHtml(label)}</span>`;
    btn.addEventListener("click", () => open(opts));
    el.appendChild(btn);
  }
  el.dataset.sbtcpayMounted = "true";
}

function defaultLabel(opts: SBTCPayOpenOptions): string {
  switch (opts.mode) {
    case "subscribe":
      return opts.plan ? `Subscribe to ${opts.plan}` : "Subscribe";
    case "invoice":
      return "Pay invoice";
    case "direct":
    default:
      return "Pay with sBTC";
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function scan(root: ParentNode = document) {
  injectStyles();
  const els = root.querySelectorAll<HTMLElement>('[data-sbtcpay]:not([data-sbtcpay-mounted="true"])');
  els.forEach(mount);
}

// Auto-init on DOM ready, and re-scan on subsequent DOM changes (host SPAs etc.)
function autoInit() {
  scan();
  if (typeof MutationObserver !== "undefined") {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (node instanceof HTMLElement) {
            if (node.matches?.("[data-sbtcpay]")) mount(node);
            scan(node);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", autoInit, { once: true });
} else {
  autoInit();
}

export const SBTCPay = {
  open,
  mount,
  scan,
  version: "1.0.0",
};

(window as Window).SBTCPay = SBTCPay;

export default SBTCPay;
