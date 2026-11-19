# App UI audit (November 2026)

An audit of the Daksha app (`os/apps/mobile`, served at https://my.daksha.life and shipped as the Android APK), and what was fixed on the `ui-audit` branch.

How it was done:

- Every main screen was opened in the real app, built for the web, against a local demo server with made-up content (see [Screenshots with made-up content](#screenshots-with-made-up-content)), at 390x844 and 1280x800, with the system set to light and to dark.
- The screen code was read against `DESIGN.md`, `AGENTS.md` ("Text and UI rules") and the tokens in `src/ui.tsx`, `src/palette.ts` and `src/astryx-tokens.ts`.
- Sizes below come from the tokens: `spacing[n]` is n x 4px, `s.text` is 16px, `s.small` is 14px, `fontSize.sm` is 12px.

Severity:

- **P0** blocks a task or loses data.
- **P1** is a real difficulty or a WCAG 2.1 AA failure.
- **P2** is an annoyance with a workaround.
- **P3** is polish.

Status: **Fixed** (on this branch), or **Left** (with the reason).

## The biggest problems

1. **Secondary buttons were invisible on the page.** Their fill (`colors.subtle`, #F1F1F1) is the page colour (`colors.canvas`, #F1F1F1). On the page, "Find", the chat suggestions, "Not now" and "Back to Apps" read as plain text. On cards they were fine. (P1, Fixed: a quiet `lineStrong` edge.)
2. **Too many black buttons.** Every picked choice (speed, tone, voice, language, filters, app categories) was drawn as a primary button. Every app row's "Connect" was primary as well. Talk settings could show six or more at once, against "one primary button per screen". Screen readers heard "button" and no state. (P1, Fixed: `Button selected` is now a radio with a check and a dark edge.)
3. **Deletes with no second chance.** Removing a person, an own key, a voice copy, or a memory on the entry page happened in one tap. (P1, Fixed.)
4. **A failed load could overwrite a saved face.** If the avatar builder could not load a saved face, it showed the default face, and "Save" replaced the person's drawing. (P0, Fixed.)
5. **Raw codes and jargon.** Examples: "denied" and "awaiting review" chips, "TypeError: Failed to fetch", "Agent updates unavailable", "Worker is offline", "keeps working on the server", "require a configured model", "tool server (MCP)", "OAuth", "bearer token", JSON field entry, and "Happened 2026-11-12". (P1, mostly Fixed.)
6. **The toast covered the chat box.** On Chat it sat on top of the composer. Its close button was 16x16, and screen readers did not hear it. (P1, Fixed.)
7. **Talk's promise was a wall of small text.** Six sentences at 14px. (P1, Fixed: three short 16px points.)

## Global (shared components and tokens)

| Severity | Problem | Where | Status |
|---|---|---|---|
| P1 | Secondary button fill equals the page colour, so the button has no edge on the page | `ui.tsx` `s.secondary` | Fixed |
| P1 | Choice rows use primary buttons for the picked one: many primaries, and no radio role or checked state | `talk-settings-ui`, `own-keys-ui`, `custom-people-ui`, `avatar-builder`, `agent-ui`, `connectors-ui`, `screens`, `computer`, `debo-reactions-setting` | Fixed (`Button selected`) |
| P2 | Button labels never wrap. Long names ("Save and talk to …", "Edit …") run off a 360px screen | `ui.tsx` `Button` | Fixed (`flexShrink`, `maxWidth: 100%`) |
| P2 | `Segmented` never wraps. The 5 playback speeds and the voice-copy speaker choice overflow at 360px | `ui.tsx` `Segmented` | Fixed (wraps) |
| P2 | `CheckRow` is 40px tall for a one-line label | `ui.tsx` | Fixed (44px) |
| P2 | Sheets slide or fade even with reduce motion on. The close button always says "Close details" | `ui.tsx` `Sheet` | Fixed |
| P2 | Section titles, empty-state titles and sheet titles are not headings for screen readers | `ui.tsx` | Fixed |
| P3 | Button press scale ignores reduce motion | `ui.tsx` | Fixed |
| P2 | The Astryx type scale makes `s.small` and `s.label` 14px. Some paragraphs people must read use it (task evidence, the recorder's limits text, MCP help) | many | Left: changing the scale moves every screen. Do it on purpose with the next design pass |
| P3 | Raw pixel values off the 4px scale (9, 10, 11, 15, 18, 22, 34, 72) | `chat.tsx`, `agent-ui.tsx`, `neon-gate.tsx`, `threads.tsx`, `debo-talk.tsx` | Partly fixed (chat chips, toast, threads row). Rest left |
| P3 | Tab labels are 12px | `App.tsx` | Left: at 360px wide, "Memories" at 14px does not fit a tab |

## Welcome (onboarding)

| Severity | Problem | Status |
|---|---|---|
| P1 | The welcome is an absolutely positioned view, not a modal. On web and Android, Tab and TalkBack can still reach the top bar and tabs behind it | Left: needs a focus trap or `inert` on web; worth its own change |
| P2 | "Connect an app" ends the welcome before the privacy step | Left: flow change; ask the owner |
| P3 | The welcome heading is bold, but the chat greeting just after it was light and a different size | Fixed (chat greeting uses the title style) |

## Chat

| Severity | Problem | Status |
|---|---|---|
| P1 | The toast covers the message box | Fixed |
| P1 | The toast is not announced, and its close button is 16px | Fixed |
| P1 | The three suggestion buttons look like plain lines of text (see Global, secondary buttons) | Fixed |
| P1 | New replies are not announced to screen readers | Left: needs a careful live region so streaming text is not read word by word |
| P1 | Attachments put "(artifact ID: …)" into the person's own message bubble | Left: the id is part of what the model reads, so fixing it changes the data flow |
| P2 | On a phone, the empty message box is two lines tall, with the placeholder at the top and the icons at the bottom | Fixed |
| P2 | Attachment chips are 32px tall with 12px text. The button that removes a waiting message is 32px | Fixed |
| P2 | "Message Daksha" and "Talk to Daksha" labels ignore the chosen assistant's name | Fixed |
| P2 | Error text from the server ("Request failed (500)") is shown as is in several places | Left: needs a shared error mapper. The workspace-level one is fixed (see Loading and errors) |
| P2 | Jargon in chat cards: "Agent progress", "Waiting for the server." | Fixed |
| P3 | Android keyboard padding uses a hard-coded tab height (74) | Left |

## Talk and the call bubble

| Severity | Problem | Status |
|---|---|---|
| P1 | The consent text is a 14px paragraph of six sentences | Fixed: three 16px points, and a smaller face before the call so Start talking stays on screen |
| P1 | An approval during a call cuts what will be sent to 2 lines, so a person can approve an email without reading it | Fixed |
| P1 | "Approve" is primary and "Not now" is grey, against DESIGN.md's permission ask | Fixed (equal buttons) |
| P2 | With reduce motion on, the popup and its panels still slide | Fixed (they appear in place) |
| P2 | The status, the captions and the bubble are three live regions at once, which floods screen readers | Left: needs testing with a real screen reader |
| P2 | The call bubble's menu does not take focus, does not close on Escape, and on the web opens only by right-click | Left |
| P2 | Source chips in Talk cannot be pressed, though DESIGN.md says a chip opens the original | Left |
| P3 | "Start talking" says "Not now" next to it; "Not now" closes the popup | Kept as is (honest about what it does) |

## Journal (list, recorder, entry page)

| Severity | Problem | Status |
|---|---|---|
| P1 | Each card runs the entry's title into its first sentence ("…after work The light was soft…") | Fixed (title in bold above) |
| P1 | "Forget this" on an entry page forgets at once, though What Daksha knows asks first | Fixed |
| P1 | The recorder's timer is a live region, so screen readers say the time every second | Fixed |
| P1 | The recording panel is the same grey as its buttons | Fixed (white panel) |
| P2 | "Happened 2026-11-12" shows a raw date | Fixed ("Happened Wednesday 12 November") |
| P2 | The Ctrl/⌘+Enter tip shows on phones | Fixed (only with a mouse) |
| P2 | "Stop" and "Start listening" are extra primary buttons next to "Save entry" | Fixed |
| P2 | The recorder hint says "Press the red button", which depends on colour | Fixed |
| P2 | Transcript lines are 40px tall | Left |
| P2 | The wide video layout's text card has a max height and no scroll, so long words or the editor spill past it | Left: needs a desktop pass on the entry page |
| P2 | The web `<select>` for microphone and camera is 14px, which makes iOS Safari zoom | Left |
| P3 | The entry title is 29px; other page titles are 24px | Left |

## What Daksha knows

| Severity | Problem | Status |
|---|---|---|
| P2 | "Fix this memory" and "Forget this memory" stack on every card on a phone | Fixed ("Fix this", "Forget this", with full screen reader labels) |
| P2 | "Daksha is not keeping memories right now" does not say why or what to do | Left |

## Tasks

| Severity | Problem | Status |
|---|---|---|
| P1 | Raw status codes in chips and lines ("denied", "Waiting approval", "Succeeded") | Fixed (`status-words.ts`) |
| P1 | "Agent updates unavailable. …", "Reconnect agent", "Worker is offline" | Fixed |
| P1 | A JSON field box ("Fields (JSON: …)") in the task form | Partly fixed: the button and label say what it is and who it is for. Building one field per form field is left |
| P1 | Task results print raw keys and `JSON.stringify` output | Left: needs per-kind result layouts |
| P2 | The empty state says "Delegate a task" | Fixed |
| P2 | The task sheet says "keeps working on the server", "require a configured model", "Delegate task" | Fixed |
| P2 | "Cancel task" acts at once | Fixed ("Yes, stop this task" / "Keep going") |
| P2 | The finance card's stat tiles clip at 360px | Left |

## Apps and connectors

| Severity | Problem | Status |
|---|---|---|
| P1 | "Your own tool servers" (MCP, OAuth, bearer token) shows to everyone | Fixed: folded under "For developers" unless a server is added |
| P1 | The OAuth toggle button's text overflows a phone card and has no on/off state | Fixed (a checkbox) |
| P2 | Every app row's Connect button is primary | Fixed |
| P2 | "Cancel" during a sign-in is unclear | Fixed ("Stop connecting") |
| P2 | "Persistent browser sessions" | Fixed ("Websites Daksha keeps open for you") |
| P2 | "Voice, personality and notes" sits right above a "Name, voice and notes" button | Left: two entries to the same area; merging changes navigation |
| P2 | "Reading without asking: on/off" is a button, not a switch | Left |

## Settings sheets

| Sheet | Severity | Problem | Status |
|---|---|---|---|
| Talk settings | P1 | Picked choices are primary buttons (see Global) | Fixed |
| Talk settings | P1 | Errors and "saved" show at the bottom of a long sheet, far from what was tapped | Left |
| Own keys | P1 | "Remove key" deletes at once | Fixed |
| Own keys | P2 | A model id is the placeholder; "must support tools" is not explained; the pronoun is fixed to "she" | Left |
| Own keys | P2 | Nothing shows while keys load | Left |
| Reminders | P2 | Check-in time is free text ("24-hour, for example 08:00") | Left |
| People | P1 | "Remove" deletes the person, birthday and notes at once | Fixed |
| People | P2 | The name is 14px; the details under it are 16px | Fixed |
| People | P2 | The birthday is typed as month-day | Left |
| Custom people | P2 | Learned facts and quotes are 14px, and every row's button just says "Remove" | Fixed (16px, and screen readers hear what is removed) |
| Reminders | P2 | Every reminder's button just says "Delete" | Fixed (named for screen readers) |
| Custom people | P2 | No loading state while people load | Left |
| Avatar builder | P0 | A failed load lets Save overwrite the saved face with the default | Fixed |
| Avatar builder | P2 | "Yes, delete" cannot be taken back | Fixed ("Keep it") |
| Avatar builder | P2 | Swatches are named "colour 3 of 8" | Left |
| Voice recordings | P1 | "Remove voice copy" deletes at once | Fixed |
| Voice recordings | P1 | Grey panel hides its grey buttons | Fixed |
| Voice recordings | P2 | "Cancel" or "Throw it away" drops a long recording with no check | Left |
| Review sheet | P1 | Validation errors are raw Zod output ("to.0: Invalid email") | Left |
| Review sheet | P2 | Status shows raw codes | Fixed |

## Top bar

| Severity | Problem | Status |
|---|---|---|
| P2 | The status line under the name is 12px | Fixed (14px) |
| P3 | The notification dot is the only sign of "unread" for sighted people; the label carries the count | OK as is |

## Loading, empty and error states

| Severity | Problem | Status |
|---|---|---|
| P1 | The workspace load error shows `String(e)` ("TypeError: Failed to fetch") with a separate button | Fixed (plain words, Try again inside the notice) |
| P0 | Sign-in while offline can show only buttons with no words | Fixed |
| P2 | The memories box on an entry page loads as an unlabelled grey block | Fixed |
| P2 | People and Personality show "No one yet" before they load | Left |

## Dark mode

The app has no dark theme on purpose. `DESIGN.md` says "No dark mode in the app until the light theme is finished and tested". The screenshots with the system set to dark show the same light screens with nothing broken: no white-on-white text, and no browser-styled form controls. Designing a dark theme is a separate, deliberate job.

## Motion

Daksha's face, typing dots and skeletons already respect reduce motion. Fixed here: sheets, the Talk popup and its panels, and button press scaling now stay still with reduce motion on.

## Screenshots

`os/docs/ui-audit/` has before and after PNGs (about 1.7 MB in all), taken with the steps below against the same made-up content:

- `before-*` is the app at commit `2d6285d` (where this branch started); `after-*` is this branch.
- Every screen at phone size (390x844) with a light system setting, five screens at desktop size (1280x800), and Chat with a dark system setting.
- The full set, both sizes and both settings for every screen (about 50 each), was taken too but is not committed, to keep the repo small. Run the script to make it again.
- The entry page's "after" still shows the title repeated as the first line; that was fixed after the photos (`c29589a`).
- On a phone, Talk with a waiting approval still needs a scroll to reach Start talking.

## Screenshots with made-up content

This needs no account and no network. Everything it shows is invented. Run these from `os/`:

```sh
export TMPDIR=/home/kunalkashyap8024/tmp   # only on the slow shared disk
npx -y pnpm@11.19.0 install --frozen-lockfile

# 1. The demo API on 127.0.0.1:8788: sample workspace, scripted agent, and a journal
#    filled with made-up entries. Nothing is saved; stop it with Control-C.
npx -y pnpm@11.19.0 dev:ui-demo

# 2. In another terminal, build the web app against it.
EXPO_PUBLIC_API_URL=http://127.0.0.1:8788 npx -y pnpm@11.19.0 --dir apps/mobile exec expo export --platform web --clear --output-dir dist/web

# 3. Photograph every main screen (serves dist/web on 127.0.0.1:8091).
node scripts/ui-screenshots.mjs docs/ui-audit/new after
```

- To click through by hand instead of step 3, use `EXPO_PUBLIC_API_URL=http://127.0.0.1:8788 npx -y pnpm@11.19.0 dev:web` and open http://localhost:8081.
- `SHOTS=chat,journal node scripts/ui-screenshots.mjs …` takes only those screens.
- If Playwright has not downloaded its browser, point `UI_SHOTS_CHROMIUM` at any Chromium or headless shell, for example `~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell`.

What the demo switch is, and why it is safe:

- `DEBO_DEV_SEED=1` fills the in-memory journal (`DEBO_DEV_MEMORY=1`) with six made-up entries, and their memories, for the local sample person (`apps/server/src/debo/dev-seed.ts`). It is off by default.
- `DEBO_DEV_MEMORY` already refuses to start in a live workspace, so the seed can never reach a real account.
- `pnpm dev:ui-demo` (`apps/server/src/demo/ui-entry.ts`) starts the normal API with an explicit environment. It passes no model, Google, database or auth keys, and runs from a fresh folder, so the private `.env` is never read. Its data lives in the ignored `artifacts/ui-demo/`.
- The welcome shows on first open; the screenshot script closes it with "Skip" for every screen but `welcome`.
- Not covered by the demo: live chat answers from a model, a live Talk call (needs LiveKit and a microphone), connected apps and the settings sheets that need provider keys.
