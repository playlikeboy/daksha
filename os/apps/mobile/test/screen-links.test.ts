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

test("faces and custom people open their real screens", () => {
  assert.deepEqual(screenLink("avatar-builder"), { kind: "sheet", detail: "avatar-builder" });
  assert.deepEqual(screenLink("custom-people"), { kind: "sheet", detail: "talk-settings" });
  assert.deepEqual(screenLink("custom-person-upload"), { kind: "sheet", detail: "talk-settings" });
  assert.equal(screenTitle("custom-people"), "People you made");
});

test("an unknown or not-yet-built screen is 'missing', never a crash", () => {
  assert.deepEqual(screenLink("secret-admin"), { kind: "missing" });
  assert.deepEqual(screenLink(undefined), { kind: "missing" });
  assert.deepEqual(screenLink(42), { kind: "missing" });
  assert.equal(screenTitle("secret-admin"), undefined);
  assert.equal(isAppScreen("nope"), false);
});

test("every typed screen has a title and a real place in this app", () => {
  for (const screen of appScreens) {
    assert.ok(screenTitle(screen));
    assert.ok(["sheet", "section"].includes(screenLink(screen).kind), screen);
  }
});
