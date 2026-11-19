import assert from "node:assert/strict";
import test from "node:test";
import { initials, kindOf, type PickedFile, sendPersonFiles } from "../src/custom-people-data.ts";

test("picked files are sorted into chat, photo and video; others are left out", () => {
  assert.deepEqual(kindOf("", "WhatsApp Chat with Nani.zip"), { kind: "chat", mimeType: "application/zip" });
  assert.deepEqual(kindOf("text/plain", "_chat.txt"), { kind: "chat", mimeType: "text/plain" });
  assert.deepEqual(kindOf("", "IMG_1.JPG"), { kind: "photo", mimeType: "image/jpeg" });
  assert.deepEqual(kindOf("video/quicktime", "clip.mov"), { kind: "video", mimeType: "video/quicktime" });
  assert.equal(kindOf("application/pdf", "bill.pdf"), null);
  assert.equal(initials("Meera nani"), "MN");
  assert.equal(initials(" "), "?");
});

test("sending files asks with the consent tick, sends each file, then says it is done", async () => {
  const calls: { path: string; body: unknown }[] = [];
  const api = {
    async request<T>(path: string, body?: unknown): Promise<T> {
      calls.push({ path, body });
      if (path.endsWith("/sources"))
        return {
          upload: { id: "u1" },
          files: [
            { fileId: "f1", upload: { mode: "single", url: "https://up/1", headers: {} } },
            {
              fileId: "f2",
              upload: {
                mode: "multipart",
                uploadId: "m",
                partBytes: 5,
                parts: [
                  { number: 1, url: "https://up/2a", headers: {} },
                  { number: 2, url: "https://up/2b", headers: {} },
                ],
              },
            },
          ],
        } as T;
      return { upload: { id: "u1", personId: "p", status: "queued", steps: [], filesDeleted: false } } as T;
    },
  };
  const sent: string[] = [];
  const files: PickedFile[] = [
    { name: "chat.txt", mimeType: "text/plain", sizeBytes: 3, kind: "chat", data: null },
    { name: "a.mp4", mimeType: "video/mp4", sizeBytes: 8, kind: "video", data: null },
  ];
  const fractions: number[] = [];
  const view = await sendPersonFiles(
    api,
    async (_f, url, _h, from, to) => {
      sent.push(`${url}:${from}-${to}`);
      return { etag: `e-${url}` };
    },
    "p",
    files,
    (f) => fractions.push(f),
  );
  assert.equal(view.status, "queued");
  assert.deepEqual(sent, ["https://up/1:0-3", "https://up/2a:0-5", "https://up/2b:5-8"]);
  assert.deepEqual((calls[0]?.body as { consent: boolean }).consent, true);
  assert.deepEqual(calls[1]?.body, {
    files: [
      { id: "f1" },
      { id: "f2", parts: [{ number: 1, etag: "e-https://up/2a" }, { number: 2, etag: "e-https://up/2b" }] },
    ],
  });
  assert.equal(fractions.at(-1), 1);
});
