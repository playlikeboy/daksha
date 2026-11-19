// Photographs every main screen of the app, light only, at phone (390x844) and desktop
// (1280x800) size, for the visual refresh (docs/ui-refresh/README.md). It includes the
// sign-in screen: the made-up demo API has no sign-in, so this script answers the app's
// "which sign-in?" question with "email sign-in" inside the browser. Nothing is sent anywhere.
// Run it only against the made-up demo API (`pnpm dev:ui-demo`). See docs/UI-AUDIT.md.
//
//   node scripts/ui-refresh-shots.mjs <out-dir> [label]
//
// SHOTS=signin,chat takes only those screens. SIZES=phone takes only one size.
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(join(root, "apps/worker/package.json"));
const { chromium } = require("playwright");

const out = resolve(process.argv[2] ?? join(root, "artifacts/ui-refresh"));
const label = process.argv[3] ?? "shot";
const only = process.env.SHOTS?.split(",").filter(Boolean);
const onlySizes = process.env.SIZES?.split(",").filter(Boolean);
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
  ".woff2": "font/woff2",
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
].filter((size) => !onlySizes || onlySizes.includes(size.name));

async function press(page, name, wait = 900) {
  const target = page.getByRole("button", { name }).or(page.getByRole("link", { name })).first();
  await target.click({ timeout: 6000 }).catch(() => target.click({ force: true, timeout: 6000 }));
  await page.waitForTimeout(wait);
}
async function wheel(page, pixels) {
  const size = page.viewportSize();
  await page.mouse.move(size.width / 2, size.height / 2);
  await page.mouse.wheel(0, pixels);
  await page.waitForTimeout(700);
}
async function show(page, text) {
  for (let i = 0; ; i++) {
    try {
      await page.getByText(text).first().scrollIntoViewIfNeeded({ timeout: 4000 });
      await page.waitForTimeout(500);
      return;
    } catch (error) {
      if (i >= 2) throw error;
      await page.waitForTimeout(1500);
    }
  }
}
const blur = (page) =>
  page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
const openTalkSettings = (page) => press(page, /voice, personality and notes/i, 1500);

const screens = [
  { name: "signin", path: "/", signIn: true },
  {
    name: "signin-focus",
    path: "/",
    signIn: true,
    steps: async (page) => {
      await page.keyboard.press("Tab");
      await page.getByLabel("Email").first().focus();
      await page.keyboard.type("sam@example.com", { delay: 10 });
      await page.keyboard.press("Tab");
    },
  },
  { name: "welcome", path: "/chat", keepWelcome: true },
  { name: "chat", path: "/chat" },
  { name: "journal", path: "/journal" },
  { name: "journal-list", path: "/journal", steps: (p) => wheel(p, 560) },
  {
    name: "journal-entry",
    path: "/journal",
    steps: async (p) => {
      await p.getByRole("link", { name: /Long walk by the lake/ }).first().click({ timeout: 8000 });
      await p.waitForTimeout(1500);
    },
  },
  {
    name: "recorder",
    path: "/journal",
    steps: async (p) => {
      await press(p, /^record voice$/i, 1200);
      await press(p, /^start recording$/i, 3000);
    },
  },
  { name: "talk", path: "/talk", steps: async (p) => blur(p) },
  { name: "tasks", path: "/tasks" },
  { name: "apps", path: "/apps" },
  { name: "knows", path: "/knows" },
  { name: "menu", path: "/chat", steps: (p) => press(p, /open conversations and menu/i) },
  { name: "talk-settings", path: "/apps", steps: async (p) => { await openTalkSettings(p); await blur(p); } },
  {
    name: "custom-people",
    path: "/apps",
    steps: async (p) => {
      await openTalkSettings(p);
      await show(p, /People you made/i);
      await press(p, /^make someone new$/i, 1200);
      await blur(p);
    },
  },
  {
    name: "avatar-builder",
    path: "/apps",
    steps: async (p) => {
      await press(p, /^name, voice and notes$/i, 1200);
      await press(p, /^make your own face$/i, 1500);
      await blur(p);
    },
  },
];

const browser = await chromium.launch({
  ...(process.env.UI_SHOTS_CHROMIUM ? { executablePath: process.env.UI_SHOTS_CHROMIUM } : {}),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
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
  for (const screen of screens) {
    if (only && !only.includes(screen.name)) continue;
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      colorScheme: "light",
      deviceScaleFactor: 1,
      hasTouch: size.name === "phone",
      isMobile: size.name === "phone",
      reducedMotion: "reduce",
      permissions: ["microphone", "camera"],
    });
    await pace();
    const page = await context.newPage();
    page.on("request", (request) => {
      if (request.url().includes("/api/")) apiCalls.push(Date.now());
    });
    if (screen.signIn)
      // Only in this browser: say the API uses email sign-in, so the sign-in screen shows.
      await page.route("**/api/health", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ ok: true, auth: { mode: "neon", neonAuthUrl: "http://127.0.0.1:9/auth" } }),
        }),
      );
    try {
      await page.goto(`http://127.0.0.1:${port}${screen.path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(2500);
      if (!screen.keepWelcome && !screen.signIn) {
        const skip = page.getByRole("button", { name: /^skip the welcome$/i }).first();
        if (await skip.isVisible().catch(() => false)) {
          await skip.click();
          await page.waitForTimeout(600);
        }
        const tip = page.getByRole("button", { name: /^close this message$/i }).first();
        if (await tip.isVisible().catch(() => false)) {
          await tip.click();
          await page.waitForTimeout(400);
        }
      }
      if (screen.steps) await screen.steps(page);
      await page.waitForTimeout(900);
      await page.screenshot({ path: join(out, `${label}-${screen.name}-${size.name}.png`) });
      console.log("shot", screen.name, size.name);
    } catch (error) {
      failures.push(`${screen.name} ${size.name}: ${String(error).split("\n")[0]}`);
    }
    await context.close();
  }
await browser.close();
server.close();
if (failures.length) console.log(`Could not take:\n${failures.join("\n")}`);
console.log(`Screenshots in ${out}`);
