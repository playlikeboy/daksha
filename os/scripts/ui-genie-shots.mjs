// Photographs the main screens of the app for the pastel redesign (docs/ui-genie/README.md),
// light only, at small phone (360x780), phone (390x844) and desktop (1440x900) size. Run it only against the
// made-up demo API (`pnpm dev:ui-demo`). See docs/UI-AUDIT.md.
//
//   node scripts/ui-genie-shots.mjs <out-dir> [label]
//
// SHOTS=home,chat takes only those screens. SIZES=phone,small takes only those sizes.
// UI_SHOTS_DIST points at another exported build (for "before" pictures).
import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(join(root, "apps/worker/package.json"));
const { chromium } = require("playwright");

const out = resolve(process.argv[2] ?? join(root, "artifacts/ui-genie"));
const label = process.argv[3] ?? "shot";
const only = process.env.SHOTS?.split(",").filter(Boolean);
const onlySizes = process.env.SIZES?.split(",").filter(Boolean);
const dist = resolve(process.env.UI_SHOTS_DIST ?? join(root, "apps/mobile/dist/web"));
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
  { name: "small", width: 360, height: 780 },
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
].filter((size) => !onlySizes || onlySizes.includes(size.name));

async function press(page, name, wait = 900) {
  const target = page.getByRole("button", { name }).or(page.getByRole("link", { name })).first();
  await target.click({ timeout: 6000 }).catch(() => target.click({ force: true, timeout: 6000 }));
  await page.waitForTimeout(wait);
}
const blur = (page) =>
  page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
/** Brings the first text that matches into view, giving a slow sheet a few tries. */
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
const openTalkSettings = (page) => press(page, /voice, personality and notes/i, 1800);
async function say(page, text) {
  const box = page.getByRole("textbox", { name: /^Message / }).last();
  await box.click({ timeout: 6000 });
  await box.fill(text);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(4500);
}

const screens = [
  { name: "signin", path: "/", signIn: true },
  { name: "home", path: "/" },
  { name: "chat", path: "/chat" },
  {
    name: "chat-messages",
    path: "/chat",
    steps: async (page) => {
      await say(page, "What did I write about the lake?");
      await say(page, "Can you make it shorter?");
      await blur(page);
    },
  },
  { name: "chat-activity", path: "/chat", steps: (p) => press(p, /^chat activity$/i, 1500) },
  { name: "journal", path: "/journal" },
  { name: "talk", path: "/talk", steps: async (p) => blur(p) },
  { name: "knows", path: "/knows" },
  { name: "tasks", path: "/tasks" },
  { name: "apps", path: "/apps" },
  // The Apps list when it cannot load: "Try again" must sit above the bottom tabs.
  {
    name: "apps-error",
    path: "/apps",
    failApps: true,
    steps: async (p) => {
      await p.getByRole("button", { name: /^try again$/i }).first().evaluate((el) => el.scrollIntoView({ block: "nearest" }));
      await p.waitForTimeout(600);
    },
  },
  { name: "talk-settings", path: "/apps", steps: (p) => openTalkSettings(p) },
  {
    // A made-up person's "What Daksha learned", with the voice recordings part.
    name: "talk-settings-people",
    path: "/apps",
    voiceDemo: true,
    steps: async (p) => {
      await openTalkSettings(p);
      await show(p, /People you made/i);
      await press(p, /^make someone new$/i, 1200);
      await p.getByLabel("Name", { exact: true }).last().fill("Coach Sam");
      await p.getByLabel("Who they are to you").last().fill("My old running coach (made up for this demo)");
      await press(p, /^make this person$/i, 2000);
      await press(p, /^what daksha learned$/i, 1500);
      await p.getByRole("radio", { name: /^call recording$/i }).first().click({ timeout: 6000 }).catch(() => {});
      await p.getByRole("checkbox", { name: /allowed to use these recordings/i }).first().click({ timeout: 6000 }).catch(() => {});
      await show(p, /who is talking/i).catch(() => show(p, /Coach Sam/));
      await p.getByRole("radiogroup", { name: /^what are you adding\?$/i }).first().evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => {});
      await p.waitForTimeout(600);
      await blur(p);
    },
  },
  { name: "menu", path: "/home", steps: (p) => press(p, /open conversations and menu/i, 1200) },
];

const browser = await chromium.launch({
  ...(process.env.UI_SHOTS_CHROMIUM ? { executablePath: process.env.UI_SHOTS_CHROMIUM } : {}),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});
const failures = [];
// The API allows 120 requests a minute from one address. Keep well under it.
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
    if (screen.voiceDemo) {
      // Only in this browser: one made-up call recording with two voices, so the "who is
      // talking?" card shows. The demo API cannot take recordings itself.
      const recording = {
        id: "demo-call",
        status: "ready",
        mimeType: "audio/mpeg",
        source: "call",
        createdAt: "2026-11-20T10:00:00Z",
        language: "en",
        canCopyVoice: true,
        sampleUrl: null,
        speakers: [
          { speaker: "A", seconds: 4, lineCount: 2, sampleLines: ["See you at the track at six. One more lap!"], samples: [] },
          { speaker: "B", seconds: 3, lineCount: 1, sampleLines: ["Okay, I'll bring water this time."], samples: [] },
        ],
      };
      await page.route(/\/api\/custom-people\/[^/]+\/(audio|voice)(\/[^/]+)?$/, (route) => {
        const url = route.request().url();
        const body = url.endsWith("/voice")
          ? {
              copied: false,
              key: "debo",
              consentText: "They know, and I'm allowed to copy their voice for my own private calls.",
              audioConsentText:
                "I'm allowed to use these recordings, and it's for my own private use. I understand Daksha will separate the voices, keep only this person's words, and delete the recordings.",
            }
          : url.endsWith("/audio")
            ? { available: true, uploads: [recording] }
            : recording;
        return route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
      });
    }
    if (screen.failApps)
      await page.route("**/api/connectors**", (route) =>
        route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Apps are not answering right now." }) }),
      );
    if (screen.signIn)
      // Only in this browser: say the API uses email sign-in, so the sign-in screen shows.
      await page.route("**/api/health", (route) =>
        route.fulfill({
          contentType: "application/json",
          body: JSON.stringify({ ok: true, auth: { mode: "neon", neonAuthUrl: "http://127.0.0.1:9/auth" } }),
        }),
      );
    try {
      await page.goto(`http://127.0.0.1:${port}${screen.path}`, { waitUntil: "load" });
      await page.waitForTimeout(2500);
      if (!screen.signIn) {
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
