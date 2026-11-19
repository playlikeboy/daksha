import assert from "node:assert/strict";
import test from "node:test";
import { clock, labelsReady, LabelResult, RecordingView, resultText, VoiceState } from "../src/voice-copy-data.ts";

test("labels can be sent once one voice is the custom person", () => {
  assert.equal(labelsReady({}), false);
  assert.equal(labelsReady({ "0": "me", "1": "other" }), false);
  assert.equal(labelsReady({ "0": "me", "1": "them" }), true);
});

test("sample times read like a clock", () => {
  assert.equal(clock(0), "0:00");
  assert.equal(clock(72.9), "1:12");
});

test("the result says what was kept, that the rest is gone, and what happened to the voice copy", () => {
  assert.equal(
    resultText(LabelResult.parse({ keptLines: 3, discardedVoices: 2 }), "Asha"),
    "I kept 3 lines Asha said. The other voices were thrown away. The recording is deleted.",
  );
  assert.match(
    resultText(LabelResult.parse({ keptLines: 1, discardedVoices: 0, voiceCopy: { status: "copied", createdAt: "x" } }), "Asha"),
    /1 line Asha said\. The recording is deleted\. Your calls with Asha now use the copied voice\. Each call starts by saying it's an AI version\./,
  );
  assert.match(
    resultText(LabelResult.parse({ keptLines: 0, discardedVoices: 1, voiceCopy: { status: "needs-key", message: "A voice copy needs a Cartesia key." } }), "Asha"),
    /didn't find any of Asha's words.*needs a Cartesia key/,
  );
});

test("the server's answers are read strictly", () => {
  const view = RecordingView.parse({
    id: "u",
    status: "ready",
    mimeType: "audio/ogg",
    source: "voice-note",
    createdAt: "2026-11-15T00:00:00Z",
    language: "hi",
    canCopyVoice: true,
    speakers: [{ speaker: "0", seconds: 12, lineCount: 2, sampleLines: ["hi"], samples: [{ start: 0, end: 4 }] }],
    sampleUrl: "https://x/y",
  });
  assert.equal(view.speakers[0]?.speaker, "0");
  assert.throws(() => RecordingView.parse({ ...view, status: "odd" }));
  assert.equal(VoiceState.parse({ copied: false, key: "none", message: "m", consentText: "c", audioConsentText: "a" }).key, "none");
});
