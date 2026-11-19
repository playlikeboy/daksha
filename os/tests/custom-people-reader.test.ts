// Custom people, part one: reading WhatsApp exports (Android and iPhone, 12 and 24 hour, day or
// month first) and scrubbing private details. Every chat here is made up for the test.
import assert from "node:assert/strict";
import { test } from "node:test";
import { strToU8, zipSync } from "fflate";
import { scrub } from "../apps/server/src/custom-people/scrub.ts";
import { chatTextFrom, parseWhatsApp } from "../apps/server/src/custom-people/whatsapp.ts";
import { ANDROID_12H_MDY, ANDROID_24H_DMY, IOS_12H_MDY, IOS_24H } from "./helpers/whatsapp-fixtures.ts";

test("whatsapp: Android 24 hour, day first, media and system lines dropped, lines joined", () => {
  const chat = parseWhatsApp(ANDROID_24H_DMY);
  assert.deepEqual(
    chat.messages.map((m) => [m.sender, m.text]),
    [
      ["Meera Test", "happy new year beta!!"],
      ["Rohan Test", "same to you nani"],
      ["Meera Test", "did you eat?\nmake sure you eat properly"],
    ],
  );
  assert.equal(chat.messages[2]?.at, "2024-01-01T08:05:00.000Z");
  assert.deepEqual(chat.senders, [
    { name: "Meera Test", count: 2 },
    { name: "Rohan Test", count: 1 },
  ]);
});

test("whatsapp: Android 12 hour, month first (worked out from 13 as a day), narrow space before PM", () => {
  const chat = parseWhatsApp(ANDROID_12H_MDY);
  assert.equal(chat.messages.length, 3);
  assert.equal(chat.messages[0]?.at, "2023-12-31T21:41:00.000Z");
  assert.equal(chat.messages[2]?.at, "2024-01-13T07:05:00.000Z");
});

test("whatsapp: iPhone 24 hour with seconds, system and attachments dropped, hidden marks removed", () => {
  const chat = parseWhatsApp(IOS_24H);
  assert.deepEqual(
    chat.messages.map((m) => [m.sender, m.text]),
    [
      ["Meera Test", "happy new year beta!!"],
      ["Rohan Test", "same to you nani"],
    ],
  );
  assert.equal(chat.messages[0]?.at, "2023-12-31T21:41:10.000Z");
});

test("whatsapp: iPhone 12 hour, month first, 12 AM is midnight", () => {
  const chat = parseWhatsApp(IOS_12H_MDY);
  assert.equal(chat.messages[1]?.at, "2024-01-13T00:05:00.000Z");
});

test("whatsapp: a zip from the phone is read for its _chat.txt", () => {
  const zip = zipSync({ "_chat.txt": strToU8(IOS_24H), "IMG-0001.jpg": new Uint8Array([1, 2, 3]) });
  assert.equal(parseWhatsApp(chatTextFrom(zip)).messages.length, 2);
  assert.equal(chatTextFrom(strToU8("plain text")), "plain text");
});

// ---- Scrubbing ----

test("scrub: phones, emails, codes, card and account numbers, links and addresses are removed", () => {
  const out = scrub(
    [
      "call me on +91 98765 43210 or 98765-43210",
      "mail asha.test@example.com",
      "your OTP is 482913 dont share",
      "card 4111 1111 1111 1111, account 123456789012",
      "pay to asha@okaxis, IFSC HDFC0001234",
      "see https://example.com/x?id=99",
      "Flat 4B, 12 MG Road, Indiranagar",
      "see you at 5, love you",
    ].join("\n"),
  );
  for (const secret of ["98765", "asha.test@", "482913", "4111", "123456789012", "okaxis", "HDFC0001234", "example.com", "MG Road"])
    assert.ok(!out.includes(secret), `still has ${secret}`);
  assert.match(out, /see you at 5, love you/);
});
