// Makes the downloadable deck: the home page printed to public/daksha-pitch-deck.pdf.
// Run after changing the deck or src/config.ts:
//   pnpm --filter @debo/pitch build && pnpm --filter @debo/pitch start   (in another terminal)
//   node scripts/make-pdf.mjs http://localhost:3000
// Pictures linked from https://www.daksha.life (the film poster) are read from apps/site/public in
// this checkout, so the PDF shows the files in the commit even before the site is deployed.
// Playwright is loaded from apps/web, which already depends on it (set PW_FROM to a package.json that can resolve it).
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const require = createRequire(process.env.PW_FROM ?? new URL("../../web/package.json", import.meta.url));
const { chromium } = require("playwright");
const base = process.argv[2] ?? "http://localhost:3000";
const out = fileURLToPath(new URL("../public/daksha-pitch-deck.pdf", import.meta.url));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
const sitePublic = fileURLToPath(new URL("../../site/public/", import.meta.url));
await page.route("https://www.daksha.life/**", (route) => {
  const file = sitePublic + new URL(route.request().url()).pathname.slice(1);
  if (!existsSync(file)) return route.continue();
  return route.fulfill({ path: file });
});
await page.goto(base + "/", { waitUntil: "networkidle" });
// Scroll once so lazy images load before printing.
await page.evaluate(async () => {
  for (let y = 0; y < document.body.scrollHeight; y += 400) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 80));
  }
  window.scrollTo(0, 0);
});
await page.waitForTimeout(500);
await page.pdf({ path: out, width: "1100px", printBackground: true, margin: { top: "20px", bottom: "20px" } });
await browser.close();
console.log("wrote", out);
