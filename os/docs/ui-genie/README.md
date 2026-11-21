# The pastel ("Genie") redesign of the app

November 2026. The app in `os/apps/mobile` moved from the warm paper look to a light, airy pastel look: soft glows behind the page, white and glass cards, big greeting type, round icon buttons, pill inputs, floating tabs on a phone and a side bar on a wide screen. Behaviour, routes, accessibility labels and the words tests look for did not change. There is still no dark mode.

`DESIGN.md` ("The app") is the short rule book. This page has the detail and the pictures.

## Pictures

All pictures use the made-up demo content, light only. Phone is 390x844, desktop is 1440x900.

| Screen | Before | After |
|---|---|---|
| Home, phone | [before](before-home-phone.webp) | [after](after-home-phone.webp) |
| Home, desktop | [before](before-home-desktop.webp) | [after](after-home-desktop.webp) |
| Empty chat, phone | [before](before-chat-phone.webp) | [after](after-chat-phone.webp) |
| Empty chat, desktop | [before](before-chat-desktop.webp) | [after](after-chat-desktop.webp) |
| Chat with messages, phone | [before](before-chat-messages-phone.webp) | [after](after-chat-messages-phone.webp) |
| Chat with messages, desktop | [before](before-chat-messages-desktop.webp) | [after](after-chat-messages-desktop.webp) |
| Journal, phone | [before](before-journal-phone.webp) | [after](after-journal-phone.webp) |
| Talk, phone | [before](before-talk-phone.webp) | [after](after-talk-phone.webp) |
| Chat activity, phone | | [after](after-chat-activity-phone.webp) |
| Menu, phone | | [after](after-menu-phone.webp) |
| Sign-in, desktop | | [after](after-signin-desktop.webp) |

"Before" Home is what `/` opened then (the chat), because there was no Home screen.

## What changed, screen by screen

- **Everywhere.** New palette and soft shadows. `Backdrop` (`src/genie.tsx`) draws pastel glows behind the app. Cards are 28px, fields 18px, sheets 32px. Icon buttons are round and white with a shadow. Sheet headers lost their rule line.
- **Navigation.** On a phone, a floating glass pill at the bottom: Home, Chat, Journal, Memories, Apps. It hides while the keyboard is up or while typing in the chat. At 900px and wider, a 288px glass side bar has the same places plus Tasks, recent chats (main chat and side chats, with "New side chat") and the person's name and email, with buttons for "Apps & settings" and the menu.
- **Top bar.** Clear on the web, where content fades out under it (`FadeTop`). Shows the character's face and name ("Talk to X"), or the greeting on Home. Round buttons for Chat activity (on the chat), the bell and the menu (phone only).
- **Home (new, `/home`; `/` opens it).** "Hi, name! How can I help you?", then "What's on your mind today?" and an ask box that sends to the chat. Six feature tiles: Talk, Write in journal, Ask about my life, Images, People you made, Apps (2 columns, 3 from 1180px). A Today strip with the next reminder, the check-in time and recent entries. A news slot (see below).
- **Chat.** An empty chat shows the face large (120px) in a glass circle, "Hi, I'm name.", and suggestion chips. With messages: user bubbles are Daksha blue with white text, answers are white cards. Quick-action chips (Write entry, Make an image, What's on today, Remind me, My week) sit above a pill box with attach, the text field ("Ask anything…"), speak-to-type, send/stop, and a lime Talk button. The typing dots show only until the first words arrive. "Latest messages" is a round button above the box. On Android the box rides on the keyboard. `/chat` still works.
- **Chat activity (new sheet).** From the top bar's history button: every conversation, newest first, as pastel cards with "Last used …", and "New side chat".
- **Talk.** Glows behind the call. A round close button, the name, a pill "Show transcript" / "Hide transcript" and a round settings button. A lime wave moves with your voice while Daksha listens (still with reduced motion). The pressed microphone is ink; other round buttons are white.
- **Menu.** Rows get pastel icon wells. Adds a Tasks row.
- **Journal, Memories, Tasks, Apps, People.** Pick up the new cards, buttons, titles (34px) and glows through the shared pieces in `src/ui.tsx`.
- **Sign-in.** Glows behind it; on a wide screen the three plain lines about Daksha sit in a glass panel with pastel icon wells.
- **Toast.** A pill with a lime check.

## Tokens

In `os/apps/mobile/src/brand-tokens.ts`, named for screens in `src/palette.ts`.

| Token | Value | Use |
|---|---|---|
| `paper` | `#F3F5FA` | Page (mist) |
| `band` | `#ECEFF6` | Quiet fills, segmented track |
| `surface` | `#FFFFFF` | Cards, icon buttons |
| `ink` | `#161A2B` | Text, primary button |
| `ink2` | `#4D5366` | Secondary text |
| `edge` | `#7C8296` | Field and control edges |
| `line` / `lineStrong` | `#E2E6EF` / `#CDD2E0` | Quiet lines |
| `blue` | `#3451D1` | Active tab, user bubble, send, focus ring |
| `blueSoft` | `#E2E8FF` | Selected fills |
| `sky` `lilac` `blush` `mint` `butter` `peach` | `#DDEAFF` `#E9E3FF` `#FFE2EB` `#DBF4E6` `#FFF2CC` `#FFE7D8` | Tiles and icon wells |
| `lime` | `#DDF37A` | Listening and done only |
| `glowSky` `glowLilac` `glowBlush` `glowMint` | `#C4D9FF` `#DCD0FF` `#FFD3E1` `#C8EEDA` | Backdrop glows |
| `glass` / `glassStrong` | `#FFFFFFC7` / `#FFFFFFEB` | Glass cards / tabs and side bar |
| `tomato` / `tomatoInk` / `tomatoSoft` | `#E5392B` / `#B42318` / `#FFE4E1` | Small marks / red text / its fill |
| `leafInk` / `leafSoft` / `leafPressed` | `#1E6A3B` / `#DBF4E6` / `#C2EBD3` | Sources and saved |
| `dangerInk` | `#9B1C1C` | Danger text |
| `scrim` | `#161A2B66` | Behind sheets |

Type size `hero` is 40px (Home's title); screen titles are 34px. Radius: field 18, card 28, sheet 32, pills full. Shadows: `brandShadow.card`, `raised`, `float`, `button`.

## Contrast

`os/apps/mobile/test/contrast.test.ts` checks these. Text needs 4.5:1; marks that are not text need 3:1.

| Foreground | Background | Ratio |
|---|---|---|
| ink `#161A2B` | mist `#F3F5FA` | 15.82 |
| ink | white | 17.26 |
| ink | band `#ECEFF6` | 14.99 |
| ink | blueSoft `#E2E8FF` | 14.15 |
| ink | sky / lilac / blush | 14.21 / 13.89 / 14.24 |
| ink | mint / butter / peach | 14.87 / 15.47 / 14.53 |
| ink | lime `#DDF37A` | 14.12 |
| ink2 `#4D5366` | mist / white / band | 7.01 / 7.65 / 6.65 |
| ink2 | sky / lilac / blush | 6.30 / 6.16 / 6.31 |
| ink2 | mint / butter / peach | 6.59 / 6.86 / 6.44 |
| white | blue `#3451D1` | 6.47 |
| blue | mist / white / blueSoft | 5.94 / 6.47 / 5.31 |
| white | ink | 17.26 |
| leaf `#1E6A3B` | mint / leafPressed | 5.69 / 5.07 |
| red `#B42318` | mist | 6.03 |
| danger `#9B1C1C` | redSoft `#FFE4E1` | 6.77 |
| edge `#7C8296` (not text) | mist / white | 3.51 / 3.82 |
| tomato `#E5392B` (dot only, not text) | mist | 3.89 |

## News on Home

`NewsSection` (`src/news.tsx`) is already on Home. It shows nothing until Daksha's server answers `GET /api/news?limit=n` (signed in, Bearer token) with:

```json
{ "items": [{ "id": "…", "title": "…", "summary": "…", "source": "…", "url": "https://…", "publishedAt": "2026-11-21T08:00:00Z", "reason": "optional", "imageUrl": "optional" }] }
```

- A 404 or 501 means "not built yet" and shows nothing. An empty list shows nothing. A wrong shape or another error shows one quiet line.
- The shape and the parser (`readNews`) are in `src/news-data.ts`. Pass `limit` as a prop to show more or fewer.

## Taking the pictures again

Follow "Screenshots with made-up content" in `os/docs/UI-AUDIT.md` (demo API, then a web export), then from `os/`:

```sh
node scripts/ui-genie-shots.mjs ~/tmp/genie after
```

- `SHOTS=home,chat` takes only those screens; `SIZES=phone` only one size.
- `UI_SHOTS_DIST=/path/to/older/dist/web` photographs another build, for "before" pictures.
- `UI_SHOTS_PORT` changes the local port (default 8091). `UI_SHOTS_CHROMIUM` points at a browser if Playwright has none.
- Restart the demo between full runs, and keep `chat-messages` last: the scripted agent's open requests can slow the next screen.
- Convert to webp before committing, for example `ffmpeg -i x.png -c:v libwebp -quality 85 x.webp`.

## Not checked yet

- Android and iOS builds, and the keyboard on real phones (on Android the chat box is lifted by the full keyboard height, because the tabs hide).
- Screen readers.
- Live answers with source chips (the demo has no model).
- A live Talk call and the listening wave (needs LiveKit and a microphone).
- Speak-to-type in the chat against a real server.
- The news slot with real news.
