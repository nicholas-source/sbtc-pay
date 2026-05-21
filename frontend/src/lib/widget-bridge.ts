// Bridge from the embedded widget pages to the SDK loader on the host page.
// When a widget is loaded inside the SDK modal (detected via ?embed=sdk on the
// URL), it postMessages success/error/close events to the parent window so the
// SDK can fire host-side callbacks and close the modal.

type WidgetMessage =
  | { type: "sbtcpay:ready" }
  | { type: "sbtcpay:payment_submitted"; txId: string; invoiceId?: number }
  | { type: "sbtcpay:subscription_created"; txId: string }
  | { type: "sbtcpay:error"; message: string }
  | { type: "sbtcpay:close" };

export function isEmbedded(): boolean {
  if (typeof window === "undefined") return false;
  if (window.parent === window) return false;
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get("embed") === "sdk";
  } catch {
    return false;
  }
}

export function postToParent(msg: WidgetMessage) {
  if (!isEmbedded()) return;
  // Target "*" is acceptable here because messages contain no secrets — the
  // SDK validates origin on receipt before acting on them.
  try {
    window.parent.postMessage(msg, "*");
  } catch {
    /* parent gone — ignore */
  }
}
