/**
 * Imperative <head> helpers for our client-rendered routes.
 *
 * A static SPA can't express per-route title/description/canonical in markup
 * (one index.html serves every route), so we update the tags on navigation.
 * These run during the build-time prerender too, so the per-route values are
 * baked into the snapshot HTML that crawlers receive.
 */

export const SITE_ORIGIN = "https://sbtc-pay.com";

export const DEFAULT_DESCRIPTION =
  "A working payment link in 60 seconds. Invoices, subscriptions, and one-time payments are paid directly to your wallet in sBTC or STX.";

export const DOCS_DESCRIPTION =
  "sBTC Pay documentation: integrate payment links, invoices, subscriptions, refunds, and embeddable widgets for sBTC and STX.";

/** Create-or-update a <meta> tag keyed by name= or property=. */
export function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

/**
 * Set the self-referencing canonical (and og:url) for a pathname.
 * Returns the absolute URL so callers can reuse it.
 */
export function setCanonical(pathname: string): string {
  const href = `${SITE_ORIGIN}${pathname === "/" ? "" : pathname.replace(/\/$/, "")}`;
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement("link");
    link.setAttribute("rel", "canonical");
    document.head.appendChild(link);
  }
  link.setAttribute("href", href);
  upsertMeta("property", "og:url", href);
  return href;
}

/** Set <title>, description, and the OG/Twitter title+description tags together. */
export function setTitleAndDescription(title: string, description: string) {
  document.title = title;
  upsertMeta("name", "description", description);
  upsertMeta("property", "og:title", title);
  upsertMeta("property", "og:description", description);
  upsertMeta("name", "twitter:title", title);
  upsertMeta("name", "twitter:description", description);
}

/** Emit index,follow for public surfaces; noindex,follow for app/auth/transient ones. */
export function setRobots(indexable: boolean) {
  upsertMeta("name", "robots", indexable ? "index,follow" : "noindex,follow");
}
