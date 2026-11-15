// Renders the launch video: node render.mjs --web <apps/web> --cap <recording dir> --out <dir> [--layout h|v] [--workers 8] [--only 1.5,20]
// Or the demo walkthrough: node render.mjs --edit demo --web <apps/web> --cap <dir of recording frames> --out <dir>
// Steps through the page frame by frame at 30 fps, saves JPEG frames, then encodes with ffmpeg.
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? process.argv[i + 1] : d; };
const web = arg("web"), cap = arg("cap"), out = arg("out"), layout = arg("layout", "h"), edit = arg("edit", "launch");
const workers = +arg("workers", 8), FPS = 30, only = arg("only");
const ffmpeg = process.env.FFMPEG || "ffmpeg";
if (!web || !cap || !out) throw new Error("Usage: node render.mjs --web <apps/web> --cap <recording dir> --out <dir> [--layout h|v]");
const { chromium } = createRequire(path.join(web, "package.json"))("@playwright/test");

const types = { ".html": "text/html", ".js": "text/javascript", ".woff2": "font/woff2", ".jpg": "image/jpeg", ".json": "application/json" };
const roots = { "/src/": path.join(here, "src"), "/demo/": path.join(here, "demo"), "/assets/": path.join(here, "assets"), "/cap/": cap };
const server = http.createServer((req, res) => {
  let u = decodeURIComponent(req.url.split("?")[0]);
  if (u === "/") u = edit === "demo" ? "/demo/index.html" : "/src/index.html";
  for (const [pre, dir] of Object.entries(roots)) {
    if (u.startsWith(pre)) {
      const f = path.join(dir, u.slice(pre.length));
      if (!f.startsWith(dir) || !fs.existsSync(f)) break;
      res.writeHead(200, { "content-type": types[path.extname(f)] || "application/octet-stream", "cache-control": "max-age=3600" });
      return fs.createReadStream(f).pipe(res);
    }
  }
  res.writeHead(404); res.end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/?layout=${layout}`;

const name = edit === "demo" ? "demo" : "launch-" + layout;
const frameDir = path.join(out, "frames-" + name);
fs.mkdirSync(frameDir, { recursive: true });
const browser = await chromium.launch();
const probe = await (await browser.newContext()).newPage();
await probe.goto(base); await probe.waitForFunction(() => window.ready);
const [W, H] = await probe.evaluate(() => window.SIZE);
const D = await probe.evaluate(() => window.DURATION);
await probe.close();
const total = Math.round(D * FPS);
let list = [...Array(total).keys()];
if (only) list = only.split(",").map((s) => Math.round(+s * FPS));
console.log(`${layout} ${W}x${H}, ${D}s, ${list.length} frames`);

let next = 0;
async function worker() {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(base); await page.waitForFunction(() => window.ready);
  while (next < list.length) {
    const f = list[next++];
    await page.evaluate((t) => window.seek(t), f / FPS);
    await page.screenshot({ path: path.join(frameDir, String(f).padStart(5, "0") + ".jpg"), type: "jpeg", quality: 96 });
    if (f % 150 === 0) console.log("frame", f);
  }
  await ctx.close();
}
await Promise.all(Array.from({ length: workers }, worker));
await browser.close(); server.close();
if (only) process.exit(0);

const mp4 = path.join(out, `${name}.mp4`);
const r = spawnSync(ffmpeg, ["-y", "-v", "error", "-framerate", String(FPS), "-i", path.join(frameDir, "%05d.jpg"),
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-maxrate", "6M", "-bufsize", "12M", "-pix_fmt", "yuv420p", "-movflags", "+faststart", mp4], { stdio: "inherit" });
if (r.status) throw new Error("ffmpeg failed");
console.log("wrote", mp4);
