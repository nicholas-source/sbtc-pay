/**
 * Postbuild prerender — snapshots the public routes into static HTML so crawlers
 * and social/AI bots receive content-filled markup instead of an empty SPA shell.
 *
 * How it works: serve dist/ locally, drive headless Chrome (puppeteer) through
 * each route, let the app render (incl. our per-route <head> + FAQ JSON-LD), and
 * write the resulting HTML to dist/<route>/index.html. The client still uses
 * createRoot and re-renders on real visits; this output is for first paint + bots.
 *
 * Routes come from public/sitemap.xml so there's a single source of truth.
 *
 * SAFETY: this is an enhancement, never the critical path. Any failure logs a
 * warning and exits 0 so a prerender problem can never block a deploy.
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");
const SITEMAP = join(ROOT, "public", "sitemap.xml");
const ORIGIN = "https://sbtc-pay.com";

const warn = (msg) => console.warn(`\x1b[33m[prerender] ${msg}\x1b[0m`);
const info = (msg) => console.log(`[prerender] ${msg}`);

function bail(msg) {
  warn(`${msg} — skipping prerender (the SPA still works, just unprerendered).`);
  process.exit(0);
}

if (!existsSync(DIST) || !existsSync(join(DIST, "index.html"))) bail("dist/index.html not found");

// Derive routes from the sitemap (paths only).
let routes = ["/"];
try {
  const xml = readFileSync(SITEMAP, "utf8");
  routes = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(ORIGIN, "").replace(/\/$/, "") || "/")
    .filter((r, i, a) => a.indexOf(r) === i);
} catch {
  warn("could not read sitemap.xml; prerendering only '/'");
}

// Stamp <lastmod> with the deploy date in the copy that ships (dist/), leaving
// public/sitemap.xml as the route manifest. Every deploy re-snapshots every
// page, so the deploy date is the accurate value — a hand-maintained date in
// the source file only ever goes stale. Runs before any puppeteer bail so the
// sitemap stays fresh even when prerendering is skipped.
try {
  const stamped = readFileSync(SITEMAP, "utf8").replace(
    /<lastmod>[^<]*<\/lastmod>/g,
    `<lastmod>${new Date().toISOString().slice(0, 10)}</lastmod>`,
  );
  writeFileSync(join(DIST, "sitemap.xml"), stamped);
  info("stamped dist/sitemap.xml lastmod with build date");
} catch (e) {
  warn(`could not stamp sitemap lastmod: ${e.message || e}`);
}

// Resolve a browser. On Vercel (and other serverless Linux builds) puppeteer's
// usual Chromium can't launch — missing shared libraries — so use the
// self-contained @sparticuz/chromium. Locally, use an installed system Chrome.
function findLocalChrome() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];
  return candidates.find((p) => p && existsSync(p));
}

let puppeteer;
try {
  ({ default: puppeteer } = await import("puppeteer-core"));
} catch {
  bail("puppeteer-core not installed");
}

const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV);

async function launchBrowser() {
  if (isServerless) {
    const { default: chromium } = await import("@sparticuz/chromium");
    info("launching @sparticuz/chromium (serverless build)");
    return puppeteer.launch({
      args: [...chromium.args, "--hide-scrollbars"],
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
  }
  const executablePath = findLocalChrome();
  if (!executablePath) bail("no local Chrome found (set PUPPETEER_EXECUTABLE_PATH)");
  info(`launching local Chrome: ${executablePath}`);
  return puppeteer.launch({
    headless: "new",
    executablePath,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--hide-scrollbars"],
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
};

// Static server with SPA fallback to index.html for extensionless routes.
const indexHtml = readFileSync(join(DIST, "index.html"));
const server = createServer((req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    let filePath = join(DIST, urlPath);
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      res.writeHead(200, { "Content-Type": MIME[extname(filePath)] || "application/octet-stream" });
      res.end(readFileSync(filePath));
      return;
    }
    // SPA fallback
    res.writeHead(200, { "Content-Type": MIME[".html"] });
    res.end(indexHtml);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
});

const PORT = 4100 + Math.floor(Math.random() * 800);
await new Promise((r) => server.listen(PORT, r));
info(`serving dist/ on :${PORT}, prerendering ${routes.length} routes`);

let browser;
let ok = 0;
try {
  browser = await launchBrowser();

  for (const route of routes) {
    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(`http://localhost:${PORT}${route}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      // Wait until the app has actually rendered content AND the h1's entrance
      // animation has finished (bounded; never hang on polling/websockets).
      // Checking only for the h1's existence is a race: framer-motion mounts it
      // at inline opacity:0, and a snapshot captured before the entrance ends
      // bakes an invisible headline into the HTML crawlers receive.
      await page
        .waitForFunction(
          () => {
            const root = document.getElementById("root");
            const h1 = document.querySelector("h1");
            return !!root && root.childElementCount > 0 && !!h1 && getComputedStyle(h1).opacity === "1";
          },
          { timeout: 12000 },
        )
        .catch(() => warn(`content signal timed out for ${route}, capturing as-is`));
      // Settle late renders — long enough for the hero's staggered siblings
      // (last starts ~0.4s after the h1, 0.5s duration) to finish too.
      await new Promise((r) => setTimeout(r, 1200));

      // Below-the-fold Reveals never scroll into view here, so their content
      // reaches full opacity only via the client-side safety net; wait for the
      // last of those animations to finish (polls between InvoiceMock cycle
      // transitions, so this resolves quickly), then force any straggler
      // visible. The snapshot must never ship hidden content — that is the
      // entire point of prerendering for no-JS crawlers.
      await page
        .waitForFunction(
          () =>
            ![...document.querySelectorAll('#root [style*="opacity"]')].some(
              (el) => parseFloat(el.style.opacity) < 1,
            ),
          { timeout: 6000 },
        )
        .catch(() => warn(`reveal settle timed out for ${route}, forcing visibility`));
      await page.evaluate(() => {
        document.querySelectorAll('#root [style*="opacity"]').forEach((el) => {
          if (parseFloat(el.style.opacity) < 1) {
            el.style.opacity = "1";
            el.style.transform = "none";
          }
        });
      });

      let html = await page.content();

      // The async-font trick in index.html (media="print" + onload swap) has
      // already fired by snapshot time, so the captured <link>s say
      // media="all" — which would re-block rendering for every real visitor.
      // Restore the async form; the onload attribute survives serialization
      // and re-runs the swap in the browser.
      html = html.replace(
        /(<link[^>]+(?:api\.fontshare\.com|fonts\.googleapis\.com)[^>]*?)media="all"/g,
        '$1media="print"',
      );

      // Sanity: don't overwrite a good file with an empty shell.
      if (!/<div id="root">\s*<\w/.test(html)) {
        warn(`${route} rendered empty; leaving its file untouched`);
        await page.close();
        continue;
      }

      const outDir = route === "/" ? DIST : join(DIST, route);
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, "index.html"), html);
      ok++;
      info(`✓ ${route} -> ${join(outDir, "index.html").replace(ROOT + "/", "")}`);
    } catch (e) {
      warn(`failed ${route}: ${e.message || e}`);
    } finally {
      await page.close().catch(() => {});
    }
  }
} catch (e) {
  warn(`browser error: ${e.message || e}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  server.close();
}

info(`done: ${ok}/${routes.length} routes prerendered`);
process.exit(0);
