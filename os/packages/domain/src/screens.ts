// The screens and sheets the assistant can open for the person, by name.
//
// The server's open_screen tool accepts only these names, and the app turns each one into
// a screen or a sheet (apps/mobile/src/screen-links.ts). A name the app does not know yet
// (an older app, or a screen still being built) shows a plain note instead of breaking.

export const appScreens = [
  "talk-settings",
  "people",
  "reminders",
  "own-keys",
  "apps",
  "knows",
  "journal",
  "activity",
  "goals",
  "files",
  "calendar",
  "computer",
  "avatar-builder",
  "custom-people",
  "custom-person-upload",
] as const;
export type AppScreen = (typeof appScreens)[number];

/** What each screen is called in the app, and where the person finds it by hand. */
export const appScreenInfo: Record<AppScreen, { title: string; where: string }> = {
  "talk-settings": {
    title: "Voice, personality and notes",
    where: "Menu, then Voice, personality and notes",
  },
  people: {
    title: "People in your life",
    where: "Menu, then Voice, personality and notes, then People in your life",
  },
  reminders: {
    title: "Reminders and check-in",
    where: "Menu, then Voice, personality and notes, then Reminders",
  },
  "own-keys": {
    title: "Your own AI keys",
    where: "Menu, then Voice, personality and notes, then Your own keys",
  },
  apps: { title: "Apps and settings", where: "Menu, then Apps & settings" },
  knows: { title: "What Daksha knows", where: "Menu, then Voice, personality and notes, then What Daksha knows" },
  journal: { title: "Journal", where: "The Journal tab" },
  activity: { title: "Activity", where: "The Activity screen" },
  goals: { title: "Goals", where: "The Goals screen" },
  files: { title: "Files", where: "Menu, then Files" },
  calendar: { title: "Calendar", where: "Menu, then Calendar" },
  computer: { title: "Daksha's computer", where: "Menu, then Daksha's computer" },
  "avatar-builder": {
    title: "Make your own face",
    where: "Apps & settings, then Name, voice and notes, then Make your own",
  },
  "custom-people": {
    title: "People you made",
    where: "Menu, then Voice, personality and notes, then People you made",
  },
  "custom-person-upload": {
    title: "Add chats, photos and recordings",
    where:
      "Menu, then Voice, personality and notes, then People you made: Add chats and photos, or What Daksha learned for voice notes and calls",
  },
};
