// Records a page as a sequence of crisp JPEG frames with real timestamps, using the
// Chrome DevTools screencast. Playwright's own recordVideo ignores deviceScaleFactor
// and produces small, soft video, so we do not use it.
import fs from "node:fs";

export async function startScreencast(context, page, dir, { quality = 92 } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await context.newCDPSession(page);
  const stamps = [];
  let n = 0;
  cdp.on("Page.screencastFrame", async (f) => {
    n += 1;
    fs.writeFileSync(`${dir}/${String(n).padStart(6, "0")}.jpg`, Buffer.from(f.data, "base64"));
    stamps.push(f.metadata.timestamp);
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality, everyNthFrame: 1, maxWidth: 780, maxHeight: 1688 });
  return async () => {
    await cdp.send("Page.stopScreencast").catch(() => {});
    fs.writeFileSync(`${dir}/stamps.json`, JSON.stringify(stamps));
    return stamps.length;
  };
}
