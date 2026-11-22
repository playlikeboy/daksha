// Builds the share image (Open Graph and Twitter card, 1200x630) for every Daksha site.
//   node scripts/og/build-og.mjs            (from the repo root, after `pnpm install`)
// Renders scripts/og/og.html with Playwright and writes the PNG files listed in OUTPUTS.
// Playwright is loaded from apps/web, which already depends on it.
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { chromium } = createRequire(path.join(root, "apps/web/package.json"))("@playwright/test");

const fontDir = pathToFileURL(path.join(root, "apps/site/node_modules/@fontsource/figtree/files")).href;
const tomato = pathToFileURL(path.join(root, "docs/assets/debo.svg")).href;
const shot = pathToFileURL(path.join(root, "apps/site/public/shots/knows-light.webp")).href;

const SUB = "Ask about your own life. Every answer shows where it came from.";
const OUTPUTS = [
  { file: "apps/site/public/og.png" },
  { file: "apps/web/public/og.png" },
  { file: "os/apps/mobile/public/og.png" },
  { file: "apps/pitch/public/og.png", chip: "Investor pitch", sub: "The pitch, the numbers and the sources." },
];

const template = readFileSync(path.join(root, "scripts/og/og.html"), "utf8")
  .replaceAll("FONT_DIR", fontDir)
  .replace("TOMATO", tomato)
  .replace("SHOT", shot);

// UI_SHOTS_CHROMIUM points at a browser when Playwright has none of its own (see docs/MEDIA.md).
const browser = await chromium.launch(process.env.UI_SHOTS_CHROMIUM ? { executablePath: process.env.UI_SHOTS_CHROMIUM } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const htmlPath = path.join(root, "scripts/og/.render.html");
for (const out of OUTPUTS) {
  const html = template
    .replace("SUBLINE", out.sub ?? SUB)
    .replace("CHIP", out.chip ? `<div class="chip">${out.chip}</div>` : "");
  writeFileSync(htmlPath, html);
  await page.goto(pathToFileURL(htmlPath).href);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => img.decode()));
  });
  const target = path.join(root, out.file);
  mkdirSync(path.dirname(target), { recursive: true });
  await page.screenshot({ path: target, clip: { x: 0, y: 0, width: 1200, height: 630 } });
  console.log(out.file, Math.round(statSync(target).size / 1024) + " KB");
}
rmSync(htmlPath);
await browser.close();
