// What still works after Debo was renamed Daksha (docs/RENAME.md): names and call text saved
// before the rename, and the old setting names.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCallTurns } from "../apps/mobile/src/debo-data.ts";
import { snippetOf } from "../apps/server/src/debo/service.ts";
import { assistantNameOf, BRAND, OLD_DEFAULT_NAME } from "../apps/server/src/engine/brand.ts";
import { personality, personalityFor } from "../apps/server/src/engine/personality.ts";
import { pushKeysFromEnv } from "../apps/server/src/push.ts";

test("the old default name reads as the new one; a chosen name stays", () => {
  assert.equal(BRAND, "Daksha");
  assert.equal(assistantNameOf(OLD_DEFAULT_NAME), "Daksha");
  assert.equal(assistantNameOf(undefined), "Daksha");
  assert.equal(assistantNameOf("  "), "Daksha");
  assert.equal(assistantNameOf("Riya"), "Riya");
  // The old default changes nothing in the character, like the new one.
  assert.equal(personalityFor(OLD_DEFAULT_NAME), personality);
  assert.equal(personalityFor(BRAND), personality);
  assert.match(personality, /^You are Daksha:/);
});

test("calls saved before the rename still read as calls", () => {
  const old = "[00:00] You: what did I do\n[00:07] Debo: You went hiking.";
  assert.deepEqual(
    parseCallTurns(old).map((t) => t.who),
    ["person", "debo"],
  );
  assert.deepEqual(
    parseCallTurns("[00:00] You: hi\n[00:03] Daksha: Hello.").map((t) => t.who),
    ["person", "debo"],
  );
  assert.equal(snippetOf(old), "what did I do You went hiking.");
});

test("web push reads the new setting names first, then the old ones", () => {
  assert.deepEqual(pushKeysFromEnv({ DEBO_OS_VAPID_PUBLIC_KEY: "a", DEBO_OS_VAPID_PRIVATE_KEY: "b" }), {
    publicKey: "a",
    privateKey: "b",
    subject: "https://daksha.life",
  });
  assert.deepEqual(
    pushKeysFromEnv({
      DAKSHA_OS_VAPID_PUBLIC_KEY: "new-a",
      DAKSHA_OS_VAPID_PRIVATE_KEY: "new-b",
      DAKSHA_OS_VAPID_SUBJECT: "mailto:hello@daksha.life",
      DEBO_OS_VAPID_PUBLIC_KEY: "a",
      DEBO_OS_VAPID_PRIVATE_KEY: "b",
    }),
    { publicKey: "new-a", privateKey: "new-b", subject: "mailto:hello@daksha.life" },
  );
});
