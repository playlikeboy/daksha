import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { FuseApi } from "../src/api.ts";
import { pillLabel, reviewsWaiting, TalkCall, type TalkEngine } from "../src/debo-talk-call.ts";
import type { VoiceConnection, VoiceHandlers } from "../src/debo-voice-engine.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A fake voice connection that records what happened to it. */
function rig(options: { microphoneBlocked?: boolean; failStart?: boolean } = {}) {
  const log = { ends: 0, mic: [] as boolean[], sent: [] as string[], notices: [] as string[], handlers: undefined as VoiceHandlers | undefined };
  const engine: TalkEngine = async (_api, handlers) => {
    if (options.failStart) throw new Error("no");
    log.handlers = handlers;
    const connection: VoiceConnection = {
      microphoneBlocked: !!options.microphoneBlocked,
      async setMicrophone(on) {
        log.mic.push(on);
      },
      async stopDebo() {},
      async sendText(text) {
        log.sent.push(text);
      },
      async end() {
        log.ends += 1;
        handlers.onEnded();
      },
    };
    return connection;
  };
  const call = new TalkCall({
    api: {} as FuseApi,
    engine,
    describeError: () => "Could not start.",
    notify: (text) => log.notices.push(text),
  });
  return { call, log };
}

test("a live call keeps running when the popup is collapsed", async () => {
  const { call, log } = rig();
  await call.start();
  call.popupOpen(true);
  assert.equal(call.getSnapshot().status, "live");
  assert.equal(call.getSnapshot().micOn, true);
  // Collapsing the popup only tells the call the popup is gone. Nothing else changes.
  call.popupOpen(false);
  assert.equal(call.getSnapshot().status, "live");
  assert.equal(call.getSnapshot().active, true);
  assert.equal(call.getSnapshot().micOn, true);
  assert.equal(log.ends, 0, "the room is still connected");
  // Expanding again shows the same call with its captions.
  log.handlers?.onLine("a", "you", "hello there", true);
  call.popupOpen(true);
  assert.equal(call.getSnapshot().status, "live");
  assert.equal(call.getSnapshot().lines[0]?.text, "hello there");
});

test("moving between screens does not touch the call: nothing but end(), a hang-up and dispose() ends it", async () => {
  const { call, log } = rig();
  await call.start();
  // The call knows nothing about screens. Reset (called when the popup opens) leaves a live call alone.
  call.reset();
  call.reset();
  assert.equal(call.getSnapshot().status, "live");
  assert.equal(log.ends, 0);
  // The microphone can be muted from the bar without ending anything.
  await call.toggleMicrophone();
  assert.deepEqual(log.mic, [false]);
  assert.equal(call.getSnapshot().micOn, false);
  assert.equal(call.getSnapshot().active, true);
  assert.equal(log.ends, 0);
});

test("End from the bar ends the call and turns the microphone off", async () => {
  const { call, log } = rig();
  await call.start();
  await call.end();
  assert.equal(log.ends, 1);
  assert.equal(call.getSnapshot().micOn, false);
  assert.equal(call.getSnapshot().active, false);
  assert.equal(call.getSnapshot().status, "idle");
});

test("when Daksha hangs up behind a collapsed popup, the person is told and the call is cleared", async () => {
  const { call, log } = rig();
  await call.start();
  call.popupOpen(false);
  log.handlers?.onEnded();
  assert.equal(call.getSnapshot().status, "idle");
  assert.equal(call.getSnapshot().micOn, false);
  assert.deepEqual(log.notices, ["The conversation ended. Microphone off."]);
});

test("when the call ends while the popup is open, it says so on the popup", async () => {
  const { call, log } = rig();
  await call.start();
  call.popupOpen(true);
  log.handlers?.onEnded();
  assert.equal(call.getSnapshot().status, "ended");
  assert.equal(call.getSnapshot().micOn, false);
  assert.deepEqual(log.notices, []);
});

test("signing out (dispose) ends the call so the microphone is never left on", async () => {
  const { call, log } = rig();
  await call.start();
  call.dispose();
  await Promise.resolve();
  assert.equal(log.ends, 1);
});

test("ending while the call is still connecting does not leave a room open", async () => {
  let release: (() => void) | undefined;
  const ends = { count: 0 };
  const engine: TalkEngine = (_api, handlers) =>
    new Promise((resolve) => {
      release = () =>
        resolve({
          microphoneBlocked: false,
          async setMicrophone() {},
          async stopDebo() {},
          async sendText() {},
          async end() {
            ends.count += 1;
            handlers.onEnded();
          },
        });
    });
  const call = new TalkCall({ api: {} as FuseApi, engine, describeError: () => "x", notify: () => {} });
  const starting = call.start();
  assert.equal(call.getSnapshot().status, "connecting");
  assert.equal(call.getSnapshot().active, true);
  await call.end();
  release?.();
  await starting;
  assert.equal(ends.count, 1);
  assert.equal(call.getSnapshot().status, "idle");
});

test("typed messages inside a call go out and show in the captions", async () => {
  const { call, log } = rig();
  await call.start();
  await call.send("  what is on my calendar  ");
  assert.deepEqual(log.sent, ["what is on my calendar"]);
  assert.equal(call.getSnapshot().lines.at(-1)?.who, "you");
});

test("a blocked microphone keeps the call open for typing and says so", async () => {
  const { call } = rig({ microphoneBlocked: true });
  await call.start();
  assert.equal(call.getSnapshot().status, "live");
  assert.equal(call.getSnapshot().micOn, false);
  assert.match(call.getSnapshot().problem, /microphone/i);
});

test("the minimised bar always says whether the microphone is on", () => {
  const on = pillLabel({ status: "live", micOn: true, agentState: "listening", reconnecting: false });
  const off = pillLabel({ status: "live", micOn: false, agentState: "listening", reconnecting: false });
  assert.match(on, /Microphone on/);
  assert.match(off, /Microphone off/);
  assert.match(on, /Talking with Daksha/);
});

test("reviews that need a tap on screen can be found while minimised", () => {
  const actions = [
    { id: "1", status: "awaiting_review" },
    { id: "2", status: "done" },
  ];
  assert.deepEqual(
    reviewsWaiting(actions).map((a) => a.id),
    ["1"],
  );
});

test("the screens are wired so the call lives above them", () => {
  const app = readFileSync(path.join(root, "App.tsx"), "utf8");
  const provider = app.indexOf("<TalkSessionProvider>");
  assert.ok(provider > 0 && provider < app.indexOf("<WorkspaceShell"), "the provider wraps the screens");
  assert.match(app, /talkState\.active && current !== "talk"/, "the bar shows on every screen except the popup");
  assert.match(app, /<TalkPill/);
  // The popup never hangs up by itself: leaving it, or the screen changing, is not an end.
  const popup = readFileSync(path.join(root, "src/debo-talk.tsx"), "utf8");
  assert.equal((popup.match(/talk\.end\(\)/g) ?? []).length, 1, "only the End button ends the call");
  for (const file of [popup, readFileSync(path.join(root, "src/debo-talk-session.tsx"), "utf8")])
    assert.doesNotMatch(file, /visibilitychange|pagehide|beforeunload|AppState/, "nothing ends a call when the page or app goes to the background");
});
