// Builds every icon and install picture from the tomato in docs/assets/debo.svg.
//   node scripts/icons/build-icons.mjs      (from the repo root, after `pnpm install`)
//
// The app (os/apps/mobile/public):
//   icons/icon-192.png, icons/icon-512.png                    "any" icons (round tomato on see-through)
//   icons/maskable-192.png, icons/maskable-512.png            tomato inside the safe zone on a solid page colour
//   icons/apple-touch-icon.png (180), favicon.svg, favicon.ico, favicon-32.png
//   screenshots/narrow-*.webp                                 real app screenshots (copied from the landing page)
//   screenshots/wide.png                                      three of those screenshots side by side, 1280x720
// The three websites (apps/site, apps/pitch, apps/web, in src/app): apple-icon.png and favicon.ico.
//
// Playwright is loaded from apps/web, which already depends on it.
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const { chromium } = createRequire(path.join(root, "apps/web/package.json"))("@playwright/test");

// Same value as backgroundBody in os/apps/mobile/src/astryx-tokens.ts (the app's page colour).
const PAGE = "#F1F1F1";
const svgText = readFileSync(path.join(root, "docs/assets/debo.svg"), "utf8");
const svgUrl = "data:image/svg+xml;base64," + Buffer.from(svgText).toString("base64");
const shotDir = path.join(root, "apps/site/public/shots");
const app = path.join(root, "os/apps/mobile/public");

// UI_SHOTS_CHROMIUM points at a browser when Playwright has none of its own (see docs/MEDIA.md).
const browser = await chromium.launch(process.env.UI_SHOTS_CHROMIUM ? { executablePath: process.env.UI_SHOTS_CHROMIUM } : {});

/** Draws the tomato at `scale` of the square (1 = edge to edge) on `background`, and returns PNG bytes. */
async function tomato(size, scale, background) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const box = Math.round(size * scale);
  await page.setContent(
    `<body style="margin:0;background:${background ?? "transparent"};display:grid;place-items:center;width:${size}px;height:${size}px">` +
      `<img src="${svgUrl}" width="${box}" height="${box}"></body>`,
  );
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
  const png = await page.screenshot({ omitBackground: !background });
  await page.close();
  return png;
}

function write(file, bytes) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  console.log(path.relative(root, file));
}

/** A .ico file that holds PNG pictures (every browser reads this). */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, bytes }, i) => {
    const at = 6 + 16 * i;
    head[at] = size === 256 ? 0 : size;
    head[at + 1] = size === 256 ? 0 : size;
    head.writeUInt16LE(1, at + 4);
    head.writeUInt16LE(32, at + 6);
    head.writeUInt32LE(bytes.length, at + 8);
    head.writeUInt32LE(offset, at + 12);
    offset += bytes.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.bytes)]);
}

// The tomato fills most of its 240-wide drawing, with a little air at the edges.
const faviconIco = ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, bytes: await tomato(size, 1) }))));
const appleIcon = await tomato(180, 0.78, PAGE);

// App icons.
write(path.join(app, "icons/icon-192.png"), await tomato(192, 0.92));
write(path.join(app, "icons/icon-512.png"), await tomato(512, 0.92));
// Maskable: Android may crop to a circle, so the tomato stays inside the middle 60 percent.
write(path.join(app, "icons/maskable-192.png"), await tomato(192, 0.6, PAGE));
write(path.join(app, "icons/maskable-512.png"), await tomato(512, 0.6, PAGE));
write(path.join(app, "icons/apple-touch-icon.png"), appleIcon);
write(path.join(app, "favicon-32.png"), await tomato(32, 1));
write(path.join(app, "favicon.ico"), faviconIco);
write(path.join(app, "favicon.svg"), svgText);

// Install screenshots: the real narrow ones, and a wide one made from three of them.
const shots = ["chat-light", "journal-light", "knows-light"];
for (const name of shots) {
  mkdirSync(path.join(app, "screenshots"), { recursive: true });
  copyFileSync(path.join(shotDir, `${name}.webp`), path.join(app, `screenshots/narrow-${name}.webp`));
  console.log(`os/apps/mobile/public/screenshots/narrow-${name}.webp`);
}
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const frame = (name) =>
    `<div style="width:262px;height:566px;background:#1B1B1B;border-radius:42px;padding:9px;box-shadow:0 24px 48px rgba(27,27,27,.22)">` +
    `<div style="width:100%;height:100%;border-radius:33px;overflow:hidden;background:${PAGE}">` +
    `<img src="${pathToFileURL(path.join(shotDir, name + ".webp")).href}" style="width:100%;display:block"></div></div>`;
  const html =
    `<body style="margin:0;width:1280px;height:720px;overflow:hidden;background:radial-gradient(700px 520px at 50% 45%,rgba(255,196,190,.7),rgba(255,196,190,0) 70%),${PAGE};` +
    `display:flex;align-items:center;justify-content:center;gap:56px;padding-top:150px;box-sizing:border-box">` +
    shots.map(frame).join("") +
    `</body>`;
  const tmp = path.join(root, "scripts/icons/.wide.html");
  writeFileSync(tmp, html);
  await page.goto(pathToFileURL(tmp).href);
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())));
  write(path.join(app, "screenshots/wide.png"), await page.screenshot());
  await page.close();
  (await import("node:fs")).rmSync(tmp);
}

// The three websites.
for (const site of ["apps/site", "apps/pitch", "apps/web"]) {
  write(path.join(root, site, "src/app/apple-icon.png"), appleIcon);
  write(path.join(root, site, "src/app/favicon.ico"), faviconIco);
}

await browser.close();
