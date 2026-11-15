import assert from "node:assert/strict";
import test from "node:test";
import { callLengthSeconds, parseCallTurns, segmentAt, similarReply, transcriptReply } from "../src/debo-data.ts";
import { downloadName } from "../src/debo-player-types.ts";
import { peaksFromSamples, peaksFromSegments, pushLevel } from "../src/debo-waveform-data.ts";

const segments = [
  { start: 0, end: 2.5, text: "Hello there." },
  { start: 3, end: 6, text: "We walked by the river." },
  { start: 12, end: 14, text: "Then home." },
];

test("the segment playing now is found, and none in a long pause", () => {
  assert.equal(segmentAt(segments, 0), 0);
  assert.equal(segmentAt(segments, 4), 1);
  assert.equal(segmentAt(segments, 7), 1); // just after it ends
  assert.equal(segmentAt(segments, 9), -1); // a long pause
  assert.equal(segmentAt(segments, 13), 2);
  assert.equal(segmentAt([], 3), -1);
});

test("a voice call's text reads back as turns, with how long it ran", () => {
  const turns = parseCallTurns("[00:00] You: what did I do\n[00:07] Debo: You went hiking.\nnot a turn\n[01:05] You: right");
  assert.deepEqual(
    turns.map((t) => [t.who, t.seconds, t.text]),
    [
      ["person", 0, "what did I do"],
      ["debo", 7, "You went hiking."],
      ["person", 65, "right"],
    ],
  );
  assert.equal(callLengthSeconds(turns), 65);
  assert.equal(callLengthSeconds([]), 0);
});

test("waveform bars: real loudness scaled to the loudest, or where words were said", () => {
  const samples = Array.from({ length: 1000 }, (_, i) => (i < 500 ? 0.1 : 0.5));
  const peaks = peaksFromSamples(samples, 10);
  assert.equal(peaks.length, 10);
  assert.equal(Math.max(...peaks), 1);
  assert.ok((peaks[0] ?? 1) < (peaks[9] ?? 0));
  const spoken = peaksFromSegments(segments, 15, 15);
  assert.equal(spoken.length, 15);
  assert.ok((spoken[4] ?? 0) > (spoken[9] ?? 1), "talking is taller than a pause");
  assert.equal(new Set(peaksFromSegments([], 0, 5)).size, 1);
  const history = pushLevel(pushLevel([], 0.5, 2), 2, 2);
  assert.deepEqual(pushLevel(history, 0, 2), [1, 0.04]);
});

test("replies from the server are read safely", () => {
  const t = transcriptReply.parse({ status: "ready", language: "en", text: "Hi", segments: "nonsense" });
  assert.deepEqual(t.segments, []);
  const s = similarReply.parse({
    similar: [{ id: "a", kind: "something-new", title: "T", happenedAt: "2026-11-14T00:00:00Z", snippet: "x", label: "Journal, 14 November" }],
  });
  assert.equal(s.similar[0]?.kind, "journal");
});

test("a downloaded recording gets a readable file name", () => {
  assert.equal(downloadName("Walk by the river 2026-11-14", "audio/webm;codecs=opus"), "walk-by-the-river-2026-11-14.webm");
  assert.equal(downloadName("", "video/quicktime"), "recording.mov");
});
