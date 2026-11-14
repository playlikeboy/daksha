// Records the app clips for the launch video from the live app, using the demo account.
// Usage: node record.mjs <path to apps/web> <output dir>
// Credentials come from DEBO_DEMO_EMAIL and DEBO_DEMO_PASSWORD (never written to disk).
// Output: <out>/clips/all/000001.jpg ... (780x1688), stamps.json, and <out>/marks.json
// The sample journal entry is deleted again at the end, through the app.
import { createRequire } from "node:module";
import fs from "node:fs";
import { startScreencast } from "./screencast.mjs";

const [web, out] = process.argv.slice(2);
const { chromium } = createRequire(web + "/package.json")("@playwright/test");
const email = process.env.DEBO_DEMO_EMAIL, password = process.env.DEBO_DEMO_PASSWORD;
if (!email || !password) throw new Error("Set DEBO_DEMO_EMAIL and DEBO_DEMO_PASSWORD");

const SAMPLE = "Lunch with Neha. She wants Goa on 17 to 19 January, because Aarav starts his new job on 1 December and cannot take leave before that. I still have to book the stay, and clean the spare room before Mum arrives.";
const QUESTION = "Mum is visiting and the Goa trip is coming up. What do I need to sort out, by when, and who should I talk to?";
const FEEL = "Honestly I feel a bit overwhelmed by all of this.";

const b = await chromium.launch({ args: ["--force-device-scale-factor=2", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, permissions: ["microphone"] });
const p = await ctx.newPage();
const pause = (ms) => p.waitForTimeout(ms);
const marks = {};
const mark = (k) => { marks[k] = Date.now() / 1000; console.log("mark", k); };
const step = async (name, work) => { try { await work(); } catch (e) { console.log("STEP FAILED", name, String(e).split("\n")[0]); } };
async function scroll(total, ms) { const n = 30; for (let i = 0; i < n; i++) { await p.mouse.wheel(0, total / n); await pause(ms / n); } }

await p.goto("https://my.debo.life", { waitUntil: "networkidle" });
await p.getByLabel("Email").fill(email);
await p.getByLabel("Password").fill(password);
await p.getByRole("button", { name: "Sign in", exact: true }).click();
await p.waitForURL("**/chat");
await pause(2500);

// Recording starts after sign-in so the password is never on screen.
const stop = await startScreencast(ctx, p, out + "/clips/all");
mark("start");
await pause(1500);

await step("journal", async () => {
  await p.getByRole("link", { name: "Journal" }).click();
  await p.getByLabel("Write an entry").waitFor({ timeout: 15000 });
  await pause(1200);
  mark("journal_open");
  await p.getByLabel("Write an entry").click();
  await p.getByLabel("Write an entry").pressSequentially(SAMPLE, { delay: 45 });
  mark("journal_typed");
  await pause(1200);
  await p.getByRole("button", { name: "Save entry" }).click();
  mark("journal_saved");
  await pause(5000);
});

await step("chat", async () => {
  await p.getByRole("link", { name: "Chat" }).click();
  await pause(1500);
  await p.getByRole("button", { name: "Open conversations and menu" }).click();
  await pause(1200);
  await p.getByText("New side chat", { exact: true }).click();
  await pause(2000);
  const box = p.locator('[aria-label="Message Debo"]:visible').last();
  await box.click();
  mark("q_start");
  await box.pressSequentially(QUESTION, { delay: 55 });
  mark("q_typed");
  await pause(900);
  await p.locator('[aria-label="Send message"]:visible').last().click();
  mark("q_sent");
  await p.locator('[aria-label="Stop reply"]:visible').last().waitFor({ timeout: 15000 }).catch(() => {});
  await p.locator('[aria-label="Send message"]:visible').last().waitFor({ timeout: 90000 });
  mark("answer_done");
  await pause(2000);
  const latest = p.getByRole("button", { name: "Latest messages" });
  if (await latest.isVisible().catch(() => false)) await latest.click();
  await pause(1500);
  mark("answer_bottom");
  await pause(3500);
});

await step("voice", async () => {
  await p.locator('[aria-label="Talk to Debo"]:visible').first().click();
  mark("voice_open");
  await pause(2500);
  await p.locator("button").filter({ hasText: "Start talking" }).click();
  mark("voice_start");
  await pause(9000);
  mark("voice_listening");
  await p.getByLabel("Type to Debo", { exact: true }).click();
  await pause(1000);
  const box = p.getByLabel("Type to Debo instead");
  mark("feel_start");
  await box.pressSequentially(FEEL, { delay: 60 });
  mark("feel_typed");
  await pause(500);
  await box.press("Enter");
  mark("feel_sent");
  await pause(15000);
  mark("voice_reply");
  await p.getByLabel("Close and end the conversation. Microphone turns off.").click();
  await pause(1500);
});

await step("knows", async () => {
  await p.goto("https://my.debo.life/knows", { waitUntil: "networkidle" });
  await pause(3000);
  mark("knows_top");
  await scroll(520, 3500);
  await pause(1500);
  mark("knows_end");
});

await step("journal list", async () => {
  await p.getByRole("link", { name: "Journal" }).click();
  await pause(3000);
  mark("jlist_top");
  await scroll(900, 4500);
  await pause(1000);
  mark("jlist_end");
});

await step("apps", async () => {
  await p.getByRole("link", { name: "Apps" }).click();
  await pause(3000);
  mark("apps_top");
  await scroll(400, 3000);
  await pause(1500);
  mark("apps_end");
});

const n = await stop();
console.log("frames", n);
fs.writeFileSync(out + "/marks.json", JSON.stringify(marks, null, 1));

// Remove the sample entry again, through the app.
await step("cleanup", async () => {
  await p.getByRole("link", { name: "Journal" }).click();
  await p.getByLabel("Write an entry").waitFor();
  await pause(2500);
  const card = p.locator("div").filter({ hasText: "Lunch with Neha. She wants Goa" }).filter({ has: p.getByRole("button", { name: "Delete entry" }) }).last();
  await card.getByRole("button", { name: "Delete entry" }).first().click();
  await pause(800);
  await p.getByRole("button", { name: "Yes, delete this entry" }).click();
  await pause(3000);
  const left = ((await p.locator("body").innerText()).match(/Lunch with Neha. She wants Goa/g) ?? []).length;
  console.log("sample entries left:", left);
});
await b.close();
