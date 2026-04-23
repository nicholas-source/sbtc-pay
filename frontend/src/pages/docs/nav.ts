export type DocsNavItem = {
  slug: string;
  title: string;
  description?: string;
};

export type DocsNavSection = {
  label: string;
  items: DocsNavItem[];
};

export const DOCS_NAV: DocsNavSection[] = [
  {
    label: "Get Started",
    items: [
      { slug: "", title: "Introduction", description: "What sBTC Pay is and who it's for" },
      { slug: "quickstart", title: "Quickstart", description: "From zero to first payment in 10 minutes" },
    ],
  },
  {
    label: "For Merchants",
    items: [
      { slug: "invoices", title: "Creating Invoices", description: "One-time payments with partial and overpay support" },
      { slug: "subscriptions", title: "Subscriptions", description: "Recurring billing with pause/resume/cancel" },
      { slug: "refunds", title: "Processing Refunds", description: "Full and partial refund flow" },
      { slug: "dashboard", title: "Dashboard Guide", description: "Navigating your merchant dashboard" },
      { slug: "notifications", title: "Payment Notifications", description: "How to get notified when a payment lands" },
      { slug: "fees", title: "Fees", description: "Protocol fee, network fee, and how they split" },
    ],
  },
  {
    label: "Embedding",
    items: [
      { slug: "widgets", title: "Widget Overview", description: "Three widget types and when to use each" },
      { slug: "widget-parameters", title: "URL Parameters", description: "Full reference for widget URL parameters" },
      { slug: "examples/static-site", title: "Static HTML Example", description: "Copy-paste integration for a static site" },
    ],
  },
  {
    label: "Concepts",
    items: [
      { slug: "architecture", title: "Architecture", description: "The three-layer system that powers sBTC Pay" },
      { slug: "settlement", title: "Settlement Model", description: "How funds move through the protocol" },
      { slug: "timing", title: "Burn-Block Timing", description: "Why we count in Bitcoin blocks, not Stacks blocks" },
    ],
  },
  {
    label: "Reference",
    items: [
      { slug: "contract", title: "Smart Contract", description: "Public functions, events, and error codes" },
      { slug: "errors", title: "Error Codes", description: "Full catalog of contract error codes" },
      { slug: "faq", title: "FAQ", description: "Frequently asked questions" },
    ],
  },
];

export const ALL_DOCS: DocsNavItem[] = DOCS_NAV.flatMap((section) => section.items);

export function findDocsIndex(slug: string): number {
  return ALL_DOCS.findIndex((item) => item.slug === slug);
}

export function getDocsSiblings(slug: string) {
  const idx = findDocsIndex(slug);
  return {
    prev: idx > 0 ? ALL_DOCS[idx - 1] : null,
    next: idx >= 0 && idx < ALL_DOCS.length - 1 ? ALL_DOCS[idx + 1] : null,
  };
}
