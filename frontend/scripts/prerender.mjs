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
      // Wait until the app has actually rendered content (bounded; never hang on
      // polling/websockets). Capture whatever we have when it resolves or times out.
      await page
        .waitForFunction(
          () => {
            const root = document.getElementById("root");
            return !!root && root.childElementCount > 0 && !!document.querySelector("h1");
          },
          { timeout: 12000 },
        )
        .catch(() => warn(`content signal timed out for ${route}, capturing as-is`));
      await new Promise((r) => setTimeout(r, 500)); // settle late renders

      const html = await page.content();

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
