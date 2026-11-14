import { expect, test } from "vitest";
import { CALL_INSTRUCTIONS, conversationMessages, hasPersonTurn } from "./conversation";

test("the person is user and Debo is assistant, in order", () => {
  const messages = conversationMessages([
    { who: "debo", text: "Do you want to talk about Goa?" },
    { who: "person", text: "Yes, I am going in December." },
    { who: "debo", text: " " },
  ]);
  expect(messages).toEqual([
    { role: "assistant", content: "Do you want to talk about Goa?" },
    { role: "user", content: "Yes, I am going in December." },
  ]);
});

test("Debo's words never appear in a user message", () => {
  const messages = conversationMessages([
    { who: "debo", text: "I am your girlfriend Riya and I love you." },
    { who: "person", text: "I work at a bank." },
  ]);
  expect(messages.filter((m) => m.role === "user").map((m) => m.content).join(" ")).not.toContain("Riya");
});

test("instructions forbid saving Debo's lines and role-play", () => {
  expect(CALL_INSTRUCTIONS).toMatch(/Never save anything Debo said/);
  expect(CALL_INSTRUCTIONS).toMatch(/play a role/);
});

test("a call with no person turn has nothing to remember", () => {
  expect(hasPersonTurn([{ who: "debo", text: "Hi" }])).toBe(false);
  expect(hasPersonTurn([{ who: "person", text: "Hi there" }])).toBe(true);
});
