import assert from "node:assert/strict";
import test from "node:test";
import { appScreens } from "../../../packages/domain/src/screens.ts";
import { isAppScreen, screenLink, screenTitle } from "../src/screen-links.ts";

test("settings screens open the talk settings sheet, and screens open their section", () => {
  assert.deepEqual(screenLink("talk-settings"), { kind: "sheet", detail: "talk-settings" });
  assert.deepEqual(screenLink("reminders"), { kind: "sheet", detail: "talk-settings" });
  assert.deepEqual(screenLink("apps"), { kind: "section", section: "apps" });
  assert.deepEqual(screenLink("computer"), { kind: "sheet", detail: "computer" });
});

test("an unknown or not-yet-built screen is 'missing', never a crash", () => {
  assert.deepEqual(screenLink("secret-admin"), { kind: "missing" });
  assert.deepEqual(screenLink(undefined), { kind: "missing" });
  assert.deepEqual(screenLink(42), { kind: "missing" });
  assert.equal(screenTitle("secret-admin"), undefined);
  assert.equal(isAppScreen("nope"), false);
});

test("every typed screen has a title and gives a link or a kind 'missing'", () => {
  for (const screen of appScreens) {
    assert.ok(screenTitle(screen));
    assert.ok(["sheet", "section", "missing"].includes(screenLink(screen).kind));
  }
});
