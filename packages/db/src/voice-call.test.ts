import { expect, test } from "vitest";
import {
  callMinutes,
  callSourceId,
  callTitle,
  formatTurn,
  parseCall,
  personWords,
  splitCallIntoChunks,
} from "./voice-call";

const call = [
  formatTurn("person", "What did I do last weekend?", 0),
  formatTurn("debo", "You went hiking\nwith Arun.", 7),
  formatTurn("person", "Right, and I want to go again.", 61),
].join("\n");

test("turns keep order, speaker and time", () => {
  const turns = parseCall(call);
  expect(turns.map((t) => t.who)).toEqual(["person", "debo", "person"]);
  expect(turns[1]).toMatchObject({ at: "00:07", text: "You went hiking with Arun." });
});

test("only the person's words are counted", () => {
  expect(personWords(call)).toBe(6 + 7);
  expect(personWords(formatTurn("debo", "Hello there friend", 0))).toBe(0);
});

test("title and minutes", () => {
  expect(callMinutes(call)).toBe(2);
  expect(callTitle(call)).toBe("Voice call · 2 minutes");
  expect(callTitle(formatTurn("person", "hi", 3))).toBe("Voice call · 1 minute");
});

test("the call id is stable, per person, and a uuid", () => {
  const a = callSourceId("user-a", "s1");
  expect(a).toBe(callSourceId("user-a", "s1"));
  expect(a).not.toBe(callSourceId("user-b", "s1"));
  expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("search pieces hold whole turns and are rebuilt the same every time", () => {
  const long = Array.from({ length: 40 }, (_, i) => formatTurn(i % 2 ? "debo" : "person", "word ".repeat(30), i)).join("\n");
  const pieces = splitCallIntoChunks(long);
  expect(pieces.length).toBeGreaterThan(3);
  expect(pieces.every((p) => p.length <= 1300)).toBe(true);
  expect(splitCallIntoChunks(long)).toEqual(pieces);
});
