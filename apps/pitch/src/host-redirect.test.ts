import { expect, test } from "vitest";
import { pitchRedirect } from "./host-redirect";

test("pitch.debo.life sends pages to pitch.daksha.life with path and query", () => {
  expect(pitchRedirect("https://pitch.debo.life/")).toBe("https://pitch.daksha.life/");
  expect(pitchRedirect("https://pitch.debo.life/market?tab=2")).toBe("https://pitch.daksha.life/market?tab=2");
  expect(pitchRedirect("https://x.workers.dev/economics", "PITCH.DEBO.LIFE")).toBe(
    "https://pitch.daksha.life/economics",
  );
});

test("pitch.daksha.life and preview addresses are served", () => {
  expect(pitchRedirect("https://pitch.daksha.life/")).toBeNull();
  expect(pitchRedirect("https://debo-pitch.example.workers.dev/")).toBeNull();
  expect(pitchRedirect("not a url")).toBeNull();
});

test("the deck PDF's old name sends to daksha-pitch-deck.pdf, in one hop from the old host", () => {
  expect(pitchRedirect("https://pitch.daksha.life/debo-pitch-deck.pdf")).toBe("https://pitch.daksha.life/daksha-pitch-deck.pdf");
  expect(pitchRedirect("https://pitch.debo.life/debo-pitch-deck.pdf")).toBe("https://pitch.daksha.life/daksha-pitch-deck.pdf");
  expect(pitchRedirect("https://pitch.daksha.life/daksha-pitch-deck.pdf")).toBeNull();
});
