# App visual refresh (November 2026)

The app (`os/apps/mobile`, https://my.debo.life and the Android APK) looked like a different product from the landing page: a flat grey page, plain white cards, the system font and weak headings. This refresh gives it the landing page's look (`apps/site`, see `DESIGN.md`, "The app"). Behaviour, screen reader labels and words on screen are unchanged, except the sign-in screen, which gained three short lines about what Debo does on wide screens.

## What changed

**Everywhere**

- **Fonts.** Figtree for text, Bricolage Grotesque for titles and headings, the same pair as the landing page. Every `Text` and `TextInput` comes from `src/text.tsx`, which sets Figtree, so no screen can forget it. Web: `@font-face` in `public/index.html` with `font-display: swap` (the fallback shows at once, then swaps; no invisible text), and the two most used files are preloaded. Android and iOS: the `expo-font` config plugin builds the TTFs into the app.
- **Colour.** Warm paper page (`#FBF6EF`) instead of grey `#F1F1F1`, white cards with a soft warm shadow, warm ink text, warm lines, an ink primary button. Tomato only for small marks: the active tab's icon, the unread dot, the welcome's progress dots, empty-state icons. Source chips are leaf green, as `DESIGN.md` asks.
- **Type scale.** Screen titles 28px Bricolage 800; sheet titles 22px; section headings 18px; body 16px; buttons 16px semibold (14px for small ones).
- **Controls.** Pill buttons; quiet buttons are white with a warm edge that turns ink under the pointer. Fields are 48px tall with a 16px font (no zoom on iPhone), a warm 3:1 edge, and a 3px ink ring while they have the caret (on phones, the edge turns ink and thicker).
- **Frame.** The tab bar is a white pill with a soft shadow; the active tab has a warm fill, a tomato icon and a bold label. The top bar uses the heading font for the name and loses its bottom line on wide screens (it stopped short of the window edges). Sheets have 28px corners and a soft shadow instead of an outline. Browser details follow the palette: selection colour, caret, scrollbars, theme colour.

**Per screen**

| Screen | Change |
|---|---|
| Sign-in | New `src/welcome-frame.tsx`. Bigger face, a 34px Bricolage "Welcome to Debo.", 18px subtitle, a roomier card with a 22px "Sign in", 48px fields with a visible focus ring, a 48px ink button, an underlined "New here? Create an account", and the privacy line with a green shield. On a wide screen: a soft panel on the left with the face, the hello and three lines about what Debo does; the card on the right. The access-key screen (local installs) uses the same frame. |
| Welcome | Bricolage title, tomato progress dots, warm page. |
| Chat | Bricolage greeting, white suggestion pills with a warm edge, warm composer. |
| Journal, entry page | Bricolage titles, white cards with soft shadows, warm buttons, green source chips. |
| Recorder | Warm page and controls (layout unchanged). |
| Talk | Warm page, warm approval card, warm buttons. |
| Tasks, Apps, What Debo knows | Bricolage titles and headings, warm segmented filters, tomato empty-state icon on a soft tomato circle. |
| Menu and settings sheets, custom people, avatar builder | Rounder sheets with a shadow, Bricolage titles, warm icon boxes, warm choice pills. |

## Contrast (WCAG 2.1 AA)

Computed with the WCAG formula; every pair below is also a test in `apps/mobile/test/contrast.test.ts`.

| Foreground | Background | Ratio | Needs |
|---|---|---|---|
| Ink `#221B16` | Paper `#FBF6EF` | 15.80 | 4.5 |
| Ink | White | 16.99 | 4.5 |
| Ink | Band `#F4ECE1` | 14.50 | 4.5 |
| Secondary `#5B5047` | Paper | 7.28 | 4.5 |
| Secondary | White | 7.83 | 4.5 |
| Secondary | Band | 6.68 | 4.5 |
| Paper on the ink button | Ink | 15.80 | 4.5 |
| Tomato ink `#B8281C` | Paper / white / band / tomato wash `#FDE3DC` | 5.82 / 6.25 / 5.34 / 5.12 | 4.5 |
| Leaf ink `#22612A` | Leaf wash `#E2F1DC` / paper / pressed chip `#AAD4A9` | 6.35 / 6.95 / 4.52 | 4.5 |
| Error text `#76000C` | Tomato wash | 9.69 | 4.5 |
| Field edge `#8C7D6E` | Paper / white | 3.70 / 3.98 | 3 (non-text) |
| Tomato `#E5392B` (dots, never text) | Paper | 3.94 | 3 (non-text) |
| White on the End button `#C9303A` | | 5.29 | 4.5 |

## Screenshots

Each pair is the app before (`main` at `0ca8e05`) and after, with the same made-up demo content, light system setting, 1x pixels.

| Screen | Before | After |
|---|---|---|
| Sign-in, phone | [before](before-signin-phone.png) | [after](after-signin-phone.png) |
| Sign-in with a field focused, phone | [before](before-signin-focus-phone.png) | [after](after-signin-focus-phone.png) |
| Sign-in, desktop | [before](before-signin-desktop.png) | [after](after-signin-desktop.png) |
| Welcome, phone | [before](before-welcome-phone.png) | [after](after-welcome-phone.png) |
| Chat, phone | [before](before-chat-phone.png) | [after](after-chat-phone.png) |
| Chat, desktop | [before](before-chat-desktop.png) | [after](after-chat-desktop.png) |
| Journal, phone | [before](before-journal-phone.png) | [after](after-journal-phone.png) |
| Journal, desktop | [before](before-journal-desktop.png) | [after](after-journal-desktop.png) |
| Journal list, phone | [before](before-journal-list-phone.png) | [after](after-journal-list-phone.png) |
| Entry page, phone | [before](before-journal-entry-phone.png) | [after](after-journal-entry-phone.png) |
| What Debo knows, phone | [before](before-knows-phone.png) | [after](after-knows-phone.png) |
| Talk, phone | [before](before-talk-phone.png) | [after](after-talk-phone.png) |
| Tasks, phone | [before](before-tasks-phone.png) | [after](after-tasks-phone.png) |
| Apps, phone | [before](before-apps-phone.png) | [after](after-apps-phone.png) |
| Menu, phone | [before](before-menu-phone.png) | [after](after-menu-phone.png) |
| Talk settings sheet, phone | [before](before-talk-settings-phone.png) | [after](after-talk-settings-phone.png) |

To take them again: start the demo API and export the web app as in `../UI-AUDIT.md` ("Screenshots with made-up content"), then from `os/`:

```sh
node scripts/ui-refresh-shots.mjs artifacts/ui-refresh after
```

It takes every main screen at 390x844 and 1280x800, including sign-in, recorder, custom people and the avatar builder. The demo API has no sign-in, so the script tells the app, inside its own browser only, that the API uses email sign-in. `SHOTS=signin,chat` and `SIZES=phone` narrow a run. Restart the demo API first: the welcome only shows once.

## Not checked

- The Android and iOS builds were not built or run. `expo prebuild --platform android` was run on a copy and wrote the font files, the font family XML and the `ReactFontManager` lines as expected; Gradle was not run.
- Screen readers and real phones were not tried; the words and labels did not change.
- Live chat answers with sources, a live call and connected apps cannot be shown by the demo.
