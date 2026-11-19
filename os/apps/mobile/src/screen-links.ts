// Where each screen the assistant can open (open_screen) goes in this app. Plain data, so a
// test can check that every name has a place. A name this app does not know (an older app
// talking to a newer server) gives "missing", and the chat card says so kindly.
import type { Section } from "../../../packages/domain/src/index";
import { type AppScreen, appScreenInfo, appScreens } from "../../../packages/domain/src/screens";

export type ScreenLink =
  | { kind: "sheet"; detail: "talk-settings" | "computer" | "avatar-builder" }
  | { kind: "section"; section: Section }
  | { kind: "missing" };

/** Screens this app has. Anything else is "missing". */
const links: Partial<Record<AppScreen, ScreenLink>> = {
  "talk-settings": { kind: "sheet", detail: "talk-settings" },
  // People, reminders and own keys are cards inside the talk settings sheet.
  people: { kind: "sheet", detail: "talk-settings" },
  reminders: { kind: "sheet", detail: "talk-settings" },
  "own-keys": { kind: "sheet", detail: "talk-settings" },
  computer: { kind: "sheet", detail: "computer" },
  // "Make your own" face: the builder sheet, with nothing picked yet.
  "avatar-builder": { kind: "sheet", detail: "avatar-builder" },
  // "People you made" is a card inside the talk settings sheet. Adding files starts from a
  // person there; open_custom_person_upload gives a card that opens one person's upload directly.
  "custom-people": { kind: "sheet", detail: "talk-settings" },
  "custom-person-upload": { kind: "sheet", detail: "talk-settings" },
  apps: { kind: "section", section: "apps" },
  knows: { kind: "section", section: "knows" },
  journal: { kind: "section", section: "journal" },
  activity: { kind: "section", section: "activity" },
  goals: { kind: "section", section: "goals" },
  files: { kind: "section", section: "files" },
  calendar: { kind: "section", section: "calendar" },
};

export function isAppScreen(value: unknown): value is AppScreen {
  return typeof value === "string" && (appScreens as readonly string[]).includes(value);
}

export function screenLink(screen: unknown): ScreenLink {
  return (isAppScreen(screen) && links[screen]) || { kind: "missing" };
}

/** The screen's name, as the app shows it. Undefined for a name this app does not know. */
export function screenTitle(screen: unknown): string | undefined {
  return isAppScreen(screen) ? appScreenInfo[screen].title : undefined;
}
