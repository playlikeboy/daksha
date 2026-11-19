// Takes screenshots of the app's main screens, for the UI audit and walkthroughs.
//
// It serves the exported web app (apps/mobile/dist/web) with a fallback
// to index.html (on 127.0.0.1:8091, or UI_SHOTS_PORT), so addresses like /journal/<slug> load, and photographs each screen at a
// phone size (390x844) and a desktop size (1280x800), in light and dark system settings.
// Run it only against the made-up demo API (`pnpm dev:ui-demo`). See docs/UI-AUDIT.md.
//
//   node scripts/ui-screenshots.mjs <out-dir> [label]
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(join(root, "apps/worker/package.json"));
const { chromium } = require("playwright");

const out = resolve(process.argv[2] ?? join(root, "docs/ui-audit"));
const label = process.argv[3] ?? "shot";
const only = process.env.SHOTS?.split(",").filter(Boolean);
const dist = join(root, "apps/mobile/dist/web");
if (!existsSync(join(dist, "index.html")))
  throw new Error("Export the web app first: see docs/UI-AUDIT.md, 'Screenshots with made-up content'.");
mkdirSync(out, { recursive: true });

const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".mp3": "audio/mpeg",
  ".ttf": "font/ttf",
};
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  let file = join(dist, path);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory())
    file = join(dist, "index.html");
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
});
const port = Number(process.env.UI_SHOTS_PORT ?? "8091");
await new Promise((done) => server.listen(port, "127.0.0.1", done));

const sizes = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 800 },
];
const schemes = ["light", "dark"];

/** Press the first visible control whose accessible name matches. */
async function press(page, name) {
  const target = page.getByRole("button", { name }).or(page.getByRole("link", { name })).first();
  // A see-through bar can sit over the control; press it anyway if the normal click waits too long.
  await target.click({ timeout: 4000 }).catch(() => target.click({ force: true, timeout: 4000 }));
  await page.waitForTimeout(700);
}

// Each screen: a name, an address and optional steps to reach it.
const screens = [
  { name: "welcome", path: "/chat", keepWelcome: true },
  { name: "chat", path: "/chat" },
  { name: "talk", path: "/talk" },
  { name: "journal", path: "/journal" },
  {
    name: "journal-entry",
    path: "/journal",
    steps: async (page) => {
      await page.getByText("Long walk by the lake after work").first().click({ timeout: 8000 });
      await page.waitForTimeout(1200);
    },
  },
  {
    name: "journal-recorder",
    path: "/journal",
    steps: (page) => press(page, /record a voice note|voice note|record/i),
  },
  { name: "knows", path: "/knows" },
  { name: "tasks", path: "/tasks" },
  { name: "apps", path: "/apps" },
  { name: "menu", path: "/chat", steps: (page) => press(page, /open conversations and menu/i) },
  {
    name: "talk-settings",
    path: "/apps",
    steps: (page) => press(page, /voice, personality and notes/i),
  },
  { name: "notifications", path: "/chat", steps: (page) => press(page, /^notifications/i) },
  { name: "not-found", path: "/no-such-page" },
];

// UI_SHOTS_CHROMIUM: a Chromium already on this machine, when Playwright has not downloaded its own.
const browser = await chromium.launch(
  process.env.UI_SHOTS_CHROMIUM ? { executablePath: process.env.UI_SHOTS_CHROMIUM } : {},
);
const failures = [];
// The API allows 120 requests a minute from one address. Keep well under it, or a screen
// shows "Too many requests" instead of itself.
const apiCalls = [];
async function pace() {
  for (;;) {
    const recent = apiCalls.filter((t) => t > Date.now() - 60_000);
    apiCalls.splice(0, apiCalls.length, ...recent);
    if (recent.length < 70) return;
    await new Promise((done) => setTimeout(done, 2000));
  }
}
for (const size of sizes)
  for (const scheme of schemes) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      colorScheme: scheme,
      deviceScaleFactor: 1,
      hasTouch: size.name === "phone",
      isMobile: size.name === "phone",
    });
    for (const screen of screens) {
      if (only && !only.includes(screen.name)) continue;
      await pace();
      const page = await context.newPage();
      page.on("request", (request) => {
        if (request.url().includes("/api/")) apiCalls.push(Date.now());
      });
      try {
        await page.goto(`http://127.0.0.1:${port}${screen.path}`, { waitUntil: "networkidle" });
        await page.waitForTimeout(2500);
        // The welcome shows until it is finished once; close it for every other screen.
        if (!screen.keepWelcome) {
          const skip = page.getByRole("button", { name: /skip|not now|maybe later|close the welcome/i }).first();
          if (await skip.isVisible().catch(() => false)) {
            await skip.click();
            await page.waitForTimeout(600);
          }
        }
        if (screen.steps) await screen.steps(page);
        await page.waitForTimeout(800);
        await page.screenshot({ path: join(out, `${label}-${screen.name}-${size.name}-${scheme}.png`) });
      } catch (error) {
        failures.push(`${screen.name} ${size.name} ${scheme}: ${String(error).split("\n")[0]}`);
      }
      await page.close();
    }
    await context.close();
  }
await browser.close();
server.close();
if (failures.length) console.log(`Could not take:\n${failures.join("\n")}`);
console.log(`Screenshots in ${out}`);
