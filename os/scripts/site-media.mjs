// Takes the pictures for the landing page, the pitch site and the walkthrough film,
// from the app running against the made-up demo API (`pnpm dev:ui-demo`). See docs/MEDIA.md.
//
//   node scripts/site-media.mjs <out-dir> [shots|clips|all]
//
// It serves the exported web app (apps/mobile/dist/web) on 127.0.0.1:8091 (UI_SHOTS_PORT),
// opens it at phone size (390x844) at 2x, so every picture is 780x1688, light system setting.
// - shots: one PNG per screen in <out>/shots/<name>.png
// - clips: short stop-motion recordings for the film. Each clip is a folder of JPEG frames in
//   <out>/clips/<clip>/, and <out>/clips.json says how long each frame stays on screen.
// Everything typed here is made up. The demo API keeps it in memory only.
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(join(root, "apps/worker/package.json"));
const { chromium } = require("playwright");

const out = resolve(process.argv[2] ?? join(root, "artifacts/site-media"));
const what = process.argv[3] ?? "all";
// UI_SHOTS_DIST points at another exported build.
const dist = resolve(process.env.UI_SHOTS_DIST ?? join(root, "apps/mobile/dist/web"));
if (!existsSync(join(dist, "index.html")))
  throw new Error("Export the web app first: see docs/UI-AUDIT.md, 'Screenshots with made-up content'.");

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

// A fake microphone and camera, so the recorder can show a recording in progress.
const browser = await chromium.launch({
  ...(process.env.UI_SHOTS_CHROMIUM ? { executablePath: process.env.UI_SHOTS_CHROMIUM } : {}),
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"],
});

async function open(path, { keepWelcome = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
    permissions: ["microphone", "camera"],
  });
  const page = await context.newPage();
  // Some screens keep asking the demo API (Apps), so the network may never go quiet.
  await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: "networkidle", timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (!keepWelcome) {
    const skip = page.getByRole("button", { name: /^skip the welcome$/i }).first();
    if (await skip.isVisible().catch(() => false)) {
      await skip.click();
      await page.waitForTimeout(600);
    }
    // The tip that follows the welcome covers the chat box; close it.
    const tip = page.getByRole("button", { name: /^close this message$/i }).first();
    if (await tip.isVisible().catch(() => false)) {
      await tip.click();
      await page.waitForTimeout(400);
    }
  }
  return { context, page };
}

/** Press the first visible control whose accessible name matches. */
async function press(page, name, wait = 900) {
  const target = page.getByRole("button", { name }).or(page.getByRole("link", { name })).first();
  await target.click({ timeout: 6000 }).catch(() => target.click({ force: true, timeout: 6000 }));
  await page.waitForTimeout(wait);
}
/** Scrolls the list under the middle of the screen. */
async function wheel(page, pixels) {
  await page.mouse.move(195, 420);
  await page.mouse.wheel(0, pixels);
  await page.waitForTimeout(700);
}
async function show(page, text) {
  // Sheets load their parts one by one; give the one we want a few tries.
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
// A focus ring left on a close button looks like a mistake in a still picture.
const blur = (page) => page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());

const openTalkSettings = (page) => press(page, /voice, personality and notes/i, 1500);

// The made-up person typed into "Make someone new".
const PERSON = {
  name: "Coach Sam",
  who: "My old running coach (made up for this demo)",
  like: "Cheerful, short sentences, always says one more lap",
};
async function fillPerson(page) {
  await page.getByLabel("Name", { exact: true }).last().fill(PERSON.name);
  await page.getByLabel("Who they are to you").last().fill(PERSON.who);
  await page.getByLabel("What they are like and how they talk").last().fill(PERSON.like);
}

// ---------------------------------------------------------------- stills

const shots = [
  { name: "welcome", path: "/chat", keepWelcome: true },
  { name: "home", path: "/home" },
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
      await press(p, /^start recording$/i, 4200);
    },
  },
  { name: "knows", path: "/knows" },
  { name: "talk", path: "/talk", steps: async (p) => blur(p) },
  { name: "tasks", path: "/tasks", steps: (p) => wheel(p, 360) },
  { name: "apps", path: "/apps" },
  {
    name: "reminders",
    path: "/apps",
    steps: async (p) => {
      await openTalkSettings(p);
      await show(p, /Reminders and check-in/i);
    },
  },
  {
    name: "custom-people",
    path: "/apps",
    steps: async (p) => {
      await openTalkSettings(p);
      await show(p, /People you made/i);
      await press(p, /^make someone new$/i, 1200);
      await fillPerson(p);
      await blur(p);
    },
  },
  {
    name: "avatar-builder",
    path: "/apps",
    steps: async (p) => {
      await press(p, /^name, voice and notes$/i, 1200);
      await press(p, /^make your own face$/i, 1500);
    },
  },
];

const failures = [];
if (what === "all" || what === "shots") {
  const only = process.env.SHOTS?.split(",").filter(Boolean);
  mkdirSync(join(out, "shots"), { recursive: true });
  for (const shot of shots) {
    if (only && !only.includes(shot.name)) continue;
    const { context, page } = await open(shot.path, shot);
    try {
      if (shot.steps) await shot.steps(page);
      await page.waitForTimeout(900);
      await page.screenshot({ path: join(out, "shots", `${shot.name}.png`) });
      console.log("shot", shot.name);
    } catch (error) {
      failures.push(`${shot.name}: ${String(error).split("\n")[0]}`);
    }
    await context.close();
  }
}

// ---------------------------------------------------------------- clips

/** Records frames of one page. Each frame is a screenshot plus how long it stays on screen. */
function recorder(page, dir) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const frames = [];
  const frame = async (seconds) => {
    const file = `${String(frames.length + 1).padStart(4, "0")}.jpg`;
    await page.screenshot({ path: join(dir, file), type: "jpeg", quality: 92 });
    frames.push(seconds);
  };
  return {
    frames,
    hold: (seconds) => frame(seconds),
    /** Types text a few letters per frame. */
    async type(text, perFrame = 3, fps = 15) {
      for (let i = 0; i < text.length; i += perFrame) {
        await page.keyboard.type(text.slice(i, i + perFrame));
        await frame(1 / fps);
      }
    },
    /** Scrolls the list under the middle of the screen, a little each frame. */
    async scroll(pixels, steps = 24, fps = 24) {
      await page.mouse.move(195, 420);
      for (let i = 0; i < steps; i++) {
        const k = (i + 1) / steps;
        const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
        const delta = (ease(k) - ease(i / steps)) * pixels;
        await page.mouse.wheel(0, delta);
        await page.waitForTimeout(60);
        await frame(1 / fps);
      }
    },
    /** A few frames while the app reacts, so a change looks smooth. */
    async settle(seconds, n = 6) {
      for (let i = 0; i < n; i++) {
        await page.waitForTimeout(120);
        await frame(seconds / n);
      }
    },
  };
}

const ENTRY = "Coffee with Sam at the corner cafe. We planned a picnic in the park for Sunday, and I said I would bake the lemon cake.";

const clips = [
  {
    name: "welcome",
    path: "/chat",
    keepWelcome: true,
    run: async (p, r) => {
      await r.hold(2.4);
    },
  },
  {
    name: "home",
    path: "/home",
    run: async (p, r) => {
      await blur(p);
      await r.hold(1.8);
      await r.scroll(520, 30);
      await r.hold(1.6);
    },
  },
  {
    name: "chat",
    path: "/chat",
    run: async (p, r) => {
      await blur(p);
      await r.hold(1.2);
      await p.getByRole("textbox", { name: /^Message / }).last().click({ timeout: 6000 });
      await r.hold(0.3);
      await r.type("What did I plan with Sam for Sunday?", 2);
      await r.hold(1.8);
    },
  },
  {
    name: "apps",
    path: "/apps",
    run: async (p, r) => {
      await blur(p);
      await r.hold(1.6);
      await r.scroll(420, 28);
      await r.hold(1.8);
    },
  },
  {
    name: "write",
    path: "/journal",
    run: async (p, r) => {
      await r.hold(0.8);
      await p.getByRole("textbox").first().click();
      await r.hold(0.3);
      await r.type(ENTRY);
      await r.hold(1.0);
      await press(p, /^save entry$/i, 300);
      await r.settle(1.2);
      await show(p, /^Find an entry$/);
      await r.hold(0.2);
      await r.scroll(260, 18);
      await r.hold(1.8);
    },
  },
  {
    name: "entry",
    path: "/journal",
    run: async (p, r) => {
      await p.getByRole("link", { name: /Long walk by the lake/ }).first().click({ timeout: 8000 });
      await p.waitForTimeout(1500);
      await r.hold(1.6);
      await r.scroll(420, 30);
      await r.hold(2.2);
    },
  },
  {
    name: "knows",
    path: "/knows",
    run: async (p, r) => {
      await r.hold(1.6);
      await r.scroll(520, 36);
      await r.hold(2.0);
    },
  },
  {
    name: "record",
    path: "/journal",
    run: async (p, r) => {
      await press(p, /^record voice$/i, 1200);
      await r.hold(1.0);
      await press(p, /^start recording$/i, 400);
      // Real time: the timer and the sound level move on their own.
      for (let i = 0; i < 40; i++) {
        await p.waitForTimeout(80);
        await r.hold(0.1);
      }
      await r.hold(0.6);
    },
  },
  {
    name: "talk",
    path: "/talk",
    run: async (p, r) => {
      await blur(p);
      await r.hold(3.6);
    },
  },
  {
    name: "tasks",
    path: "/tasks",
    run: async (p, r) => {
      await r.hold(1.0);
      await r.scroll(340, 24);
      await r.hold(2.4);
    },
  },
  {
    name: "face",
    path: "/apps",
    run: async (p, r) => {
      await press(p, /^name, voice and notes$/i, 1200);
      await press(p, /^make your own face$/i, 1500);
      await r.hold(1.2);
      for (let i = 0; i < 4; i++) {
        await press(p, /^randomise$/i, 500);
        await r.hold(0.7);
      }
      await r.hold(0.6);
    },
  },
  {
    name: "people",
    path: "/apps",
    run: async (p, r) => {
      await openTalkSettings(p);
      await show(p, /People you made/i);
      await press(p, /^make someone new$/i, 1200);
      await r.hold(0.6);
      await p.getByLabel("Name", { exact: true }).last().click();
      await r.type(PERSON.name, 2);
      await p.getByLabel("Who they are to you").last().click();
      await r.type(PERSON.who, 3);
      await p.getByLabel("What they are like and how they talk").last().click();
      await r.type(PERSON.like, 3);
      await blur(p);
      await r.hold(1.6);
    },
  },
  {
    name: "reminders",
    path: "/apps",
    run: async (p, r) => {
      await openTalkSettings(p);
      await show(p, /Reminders and check-in/i);
      await r.hold(3.0);
    },
  },
];

if (what === "all" || what === "clips") {
  const only = process.env.CLIPS?.split(",").filter(Boolean);
  const index = existsSync(join(out, "clips.json"))
    ? JSON.parse(await import("node:fs").then((fs) => fs.readFileSync(join(out, "clips.json"), "utf8")))
    : {};
  for (const clip of clips) {
    if (only && !only.includes(clip.name)) continue;
    const { context, page } = await open(clip.path, clip);
    const r = recorder(page, join(out, "clips", clip.name));
    try {
      await clip.run(page, r);
      index[clip.name] = r.frames;
      const total = r.frames.reduce((a, b) => a + b, 0);
      console.log("clip", clip.name, r.frames.length, "frames", total.toFixed(1), "s");
    } catch (error) {
      failures.push(`clip ${clip.name}: ${String(error).split("\n")[0]}`);
    }
    await context.close();
  }
  writeFileSync(join(out, "clips.json"), JSON.stringify(index));
}

await browser.close();
server.close();
if (failures.length) console.log(`Could not take:\n${failures.join("\n")}`);
console.log(`Pictures in ${out}`);
