# DESIGN.md

How Daksha looks, moves and feels. The landing page in `apps/web` is the reference. Tokens live in `apps/web/src/app/globals.css`.

## The feeling

Daksha should feel like a small, kind friend who keeps your things safe. Two words guide every choice: **cute** and **trustworthy**. When they pull apart, trustworthy wins.

- Cute comes from Daksha itself (the mascot), soft shapes and a warm voice.
- Trust comes from calm layouts, plain words, strong contrast and showing sources.
- Never cute at the cost of clarity. No baby talk, no emoji walls, no confetti.

## Daksha, the mascot

A small, round, slightly squat red tomato with a soft highlight, a green leafy top with a short stem, two friendly dark eyes with small highlights, light blush cheeks and a small smile. It is drawn in flat SVG shapes with no outline. The master drawing is `docs/assets/debo.svg`; the landing page (`apps/site`), the app (`os/apps/mobile`) and the share image use copies of it. The older `apps/web` page still draws the earlier yellow character in `apps/web/src/components/debo-art.tsx` and is being replaced.

### The app (`os/apps/mobile`)

Since the November 2026 refresh the app looks like the landing page, so both feel like one product. The table further below still describes the older `apps/web`.

- **Colour:** the landing page's warm tokens, kept in `src/brand-tokens.ts` and named for screens in `src/palette.ts`: paper page (`#FBF6EF`), white cards, warm ink (`#221B16`) for text and the primary button, warm secondary text (`#5B5047`), warm lines. Tomato (`#E5392B`) is for small marks only: the active tab's icon, the unread dot, the welcome's progress dots and empty-state icons (tomato ink `#B8281C` where it is text-sized). Sources are leaf green. Astryx Neutral (`src/astryx-tokens.ts`) still gives spacing and the colours the brand file does not name. `test/contrast.test.ts` checks every text pair for WCAG AA.
- **Type:** Figtree for text and controls, Bricolage Grotesque (700 and 800) for screen titles, sheet titles and section headings (`s.pageTitle`, `s.title`, `s.heading` in `src/ui.tsx`). Every `Text` and `TextInput` comes from `src/text.tsx`, which sets Figtree, so no screen can forget it (a test checks). On the web the fonts are `@font-face` rules in `public/index.html` with `font-display: swap`; on Android and iOS the `expo-font` plugin in `app.json` builds the TTFs in `assets/fonts/` into the app.
- **Shape:** cards 20px with a soft warm shadow, fields and chips 14px, sheets 28px, pill buttons. Primary buttons are ink, quiet buttons are white with a warm edge that darkens under the pointer.
- **Focus:** a 3px ink ring on whatever the keyboard is on, and on any text field that has the caret.
- **Sign-in:** `src/welcome-frame.tsx`. One column on a phone; on a wide screen the hello and three plain lines about what Daksha does sit in a soft panel beside the card.
- Daksha's face is still the only character on a screen. The app stays light; a dark theme is still deferred (see "Do not").

### The landing page (`apps/site`)

The landing page has its own look, written in one plain stylesheet, `apps/site/src/app/site.css`, with no component library. It was rebuilt in November 2026 to feel modern, calm and warm for people who are not technical.

- **Colour:** a warm paper background (`--bg` `#fbf6ef`), warm near-black ink (`--ink` `#221b16`), a slightly darker band colour for every other section, Daksha's tomato red for small marks and the hero, and leaf green for sources. All tokens are on `:root` in `site.css`. Primary buttons are ink, not red.
- **Dark mode:** the page follows the person's system setting. The moon button in the header switches it and keeps the choice in that browser (only the word "light" or "dark"). Every token has a dark value; screenshots of the app stay light inside a dark phone frame.
- **Type:** headings in Bricolage Grotesque Variable (weight 700 to 800, tight tracking), body in Figtree. Both are self-hosted through `@fontsource-variable/bricolage-grotesque` and `@fontsource/figtree`, so there is no request to a font service.
- **Shape:** soft rounded panels (20 to 32px), pill buttons, soft shadows with blur. No hard offset shadows on this page.
- **The brand name** is one constant, `BRAND` in `apps/site/src/brand.ts`, so a rename changes every heading and button at once.
- **Section order** is in `apps/site/src/app/page.tsx`, one line per section. New sections use `Section` and `SectionHead` from `apps/site/src/components/section.tsx`.
- **Films** (the launch film and the walkthrough) play in a Video.js player. Their files, posters, words-on-screen tracks and descriptions are listed once, in `apps/site/src/media.ts`, so new footage is a change to that file and `public/`. See "The film player" below.

### The film player (`apps/site`)

The films use **Video.js 10** through `@videojs/react`, pinned to `10.3.0` (Apache-2.0, published 4 November 2026). Chosen in November 2026 from four open-source players:

| Player | Licence | State in November 2026 | Why not |
|---|---|---|---|
| Video.js 10 (`@videojs/react`) | Apache-2.0 | Active. 10.0 came out on 1 October 2026 and new releases come every week or two. | Chosen. |
| Vidstack (`@vidstack/react` 1.15.7) | MIT | Deprecated on npm: security fixes only, until January 2028. Its makers point to Video.js 10. | No new work. |
| Plyr 3.8.5 | MIT | Deprecated on npm: security fixes only. Points to Video.js 10. | No new work, not made for React. |
| Media Chrome 4.19 | MIT | Active, but its makers (Mux) now build Video.js 10 together with the Vidstack and Plyr makers, and Video.js has a guide for moving from it. | Web components, so React and server rendering need a wrapper. |

Why Video.js 10 fits this page:

- **React 19 and Next.js.** It is React components, not a wrapper around a script. It supports React 18 and 19 and renders plain markup on the server.
- **Accessible out of the box.** Every control is a labelled button or slider, the player is a named group you can tab to, changes like "playing" or "captions on" are read out by screen readers, and it follows `prefers-reduced-motion` and `prefers-contrast`. Keys: Space or K play and pause, M mute, F fullscreen, C captions, arrows seek and change volume, 0 to 9 jump.
- **Phones.** Plays inline (`playsInline`), tap shows the controls and double tap seeks. Fullscreen uses the standard browser call, and on iPhone falls back to Safari's own video fullscreen.
- **Theming without copying its code.** The skin takes a few public settings (`--media-accent-color`, `--media-font-family`, `--media-border-radius` and others). We set them from our own tokens, so the slider is tomato and the type is Figtree in light and dark.
- **Small where it counts.** We load it only near the films (below). In the November 2026 build the player is about 78 KB of script and 10 KB of styles after compression, fetched in the background; the first page load carries none of it.

How it is built:

- `film.tsx` (server) holds the words. `film-player.tsx` is a small client island: it shows the poster and an ink play button inside the same 16:9 frame, so nothing moves when the player arrives. About a screen before the film scrolls into view it imports `film-player-vjs.tsx`, which brings Video.js and its stylesheet. The rest of the page never loads player code.
- Nothing plays by itself. The film starts, with sound, only when pressed. `preload="none"` means no part of the film downloads before that.
- Without JavaScript the poster is a plain link to the film file.
- The skin is the Neutral video skin. Its controls stay dark in both themes, which suits a dark film frame; only the accent, font and corners follow ours.
- Each film has a "words on screen" track (`public/debo-launch.en.vtt`, `public/debo-demo.en.vtt`). The films have no speech, so the track holds only the words the film shows, timed from the film's own timeline in `video/launch`. When the footage changes, change or remove its track.
- The long description of each film is a hidden paragraph linked to the player, for screen readers. The same text, with the poster, length and file, goes to search engines as a `VideoObject`.

- Its eyes follow the pointer. This is the one playful moment on a screen. Do not add a second.
- Daksha appears once per screen at most. It is a character, not a pattern.
- Daksha never looks sad, angry or shocked at the person. When something fails, Daksha stays calm.
- Do not give Daksha a human face, body or gender.

In the app (`os/apps/mobile`) Daksha's face is drawn in code (`debo-face.tsx`) and has twelve moods: idle, listening, thinking, speaking, happy, proud, shy, curious, sleepy, worried, pouty and angry. Moods are animation only: they never change, delay or refuse an answer. `debo-mood.ts` picks the mood from what is happening and from the tone of what the person wrote, using one readable table of English, Hindi and Hinglish cue words, with no network call. Pouty is a light, playful sulk that melts away on the next kind or neutral message. Angry is rare and brief and never insulting. In serious moments (a sad or scared message, an error the person must act on, deleting, the privacy text) she stays calm. Settings has "Reactions": All, Calm (no pouty or angry) or Off. The device's reduce motion setting keeps her still. This is the exception to "Daksha never looks angry" above, and it is playful, not aimed at the person.

### Who you talk to: five characters (app only)

In the app, About Daksha has "Choose who you talk to". The person picks one of five characters. All five are drawn in code, have the same twelve moods and use the same face component, so every place that shows a face changes at once. The choice is saved in the person's account (`character` on the assistant's identity) and the older colour setting (`avatar`) is still the colour behind the face.

| Character | What it is | Name offered |
|---|---|---|
| Daksha | A small, round, soft blue creature with two little ears. The default. Not a tomato and not a person. | Daksha |
| Diya | The red tomato (the brand drawing, `docs/assets/debo.svg`). | Diya |
| Anaya | A warm young woman of about twenty, head and shoulders, in a teal kurta. Flat cartoon style, nothing more than a friendly face. | Anaya |
| Mishti | A small round orange cat. | Mishti |
| Kabir | A friendly young man of about twenty-one, head and shoulders, short dark hair with two little tufts on top, in a mustard hoodie. Drawn in the same simple flat style as Daksha: few shapes, no outline or shading lines, big glossy eyes with one shine. Nothing more than a friendly face. | Kabir |

- Everyone who never chose gets Daksha the creature. That includes accounts made before this existed: they had no way to pick, so they have no saved character, and they now see Daksha. A name they typed stays as it is.
- Picking a character offers its name as the assistant's name. If the name is still "Daksha" or another character's name, it changes with the pick. If the person typed a name of their own, it is kept and the app asks "Call me Mishti?" with "Use Mishti" and "Keep Nova". The assistant answers to the saved name in chat and voice.
- Labels use the saved name and the character's own pronoun (`debo-pronouns.ts`): Daksha the creature is "they", Diya, Anaya and Mishti are "she". A character missing from that table is "they".
- The face appears once per screen. Sizes come from `avatarSize` in `ui.tsx` (36, 48, 64, 96); the Talk popup draws it larger to fit the screen. The colour behind it is picked from small swatches, not more faces. While a call is minimised, the round call bubble at the bottom right shows the face and the top bar shows only the name.
- Each character's colours live in its own `debo-paint-*.ts` file, and each character's `expresses` table in `debo-characters.ts` says how it shows each mood. A test fails if any character misses a mood.
- Kabir is a man, so labels about the assistant say "he" and "his" while he is picked ("How he talks and what he knows"), and his voice starts as Blake, the male voice. Every other character is "she". The words come from `pronoun` in `debo-characters.ts`.
- The brand mascot is still the tomato. The landing page, pitch site, favicon and app icon still use `docs/assets/debo.svg`. The "no human face" rule above is about that brand mascot. Anaya and Kabir are characters the person picks for themselves in the app, and are never used as the brand.
- Static pictures of the five, for docs and sharing: `docs/assets/avatar-debo.svg`, `avatar-diya.svg`, `avatar-anaya.svg`, `avatar-mishti.svg`, `avatar-kabir.svg`. The landing page shows copies of them (`apps/site/public/characters/`) in its "Choose who you talk to" card, as the choice inside the app, not as the brand.

## Colour

| Token | Hex | Use |
|---|---|---|
| `--color-sky` | `#E9EEFF` | Page background |
| `--color-paper` | `#FFFFFF` | Surfaces that hold a person's own content |
| `--color-ink` | `#1B1F4B` | All text, outlines, primary buttons |
| `--color-ink-soft` | `#4A4F7A` | Secondary text |
| `--color-butter` | `#FFD23F` | Daksha, and nothing bigger than Daksha |
| `--color-mint` | `#C4F1DA` | "You are in control" moments: sources, permissions, saved |
| `--color-blush` | `#FFB3C7` | Daksha's cheeks, small highlights only |
| `--color-line` | `#C9D0F2` | Quiet borders |

Rules:

- Ink on sky, paper, butter and mint all pass WCAG AA for body text. Never put white text on butter, mint or blush.
- Butter belongs to Daksha. Do not use it for buttons, banners or backgrounds.
- Mint means the person is in control. Do not use it as decoration.
- No gradients, no glows, no glass effects. One exception in the app: the slim top bar is the page colour, slightly see-through, with a blur behind it on the web, so content can scroll under it without the bar taking space. Nothing else is frosted.
- Danger actions use ink with clear words ("Delete this memory"), not a red page.

## Type

| Role | Family | Notes |
|---|---|---|
| Headings | Bricolage Grotesque Variable | Weight 700, tight line height (1.05), slight negative tracking |
| Body and UI | Figtree Variable | Weight 400 and 600, line height 1.6 |

- Both are self-hosted through `@fontsource-variable/*`. No requests to a font service.
- Scale: 16, 18, 22, 28, 40, 56, 76 px. Do not add sizes in between.
- Body text never smaller than 16px. Lines no longer than about 65 characters.
- Sentence case. No all-caps. No italic for emphasis; use weight 600.

## Shape and space

- Radius: 12px for inputs and chips, 24px for panels, full pill for buttons. Daksha is the only circle.
- Outlines: 2px ink on things a person can press. 1px `--color-line` on things they only read.
- Shadows: one hard offset shadow, `4px 4px 0 var(--color-ink)`, only on the primary button and the answer card. Nothing else gets a shadow.
- Spacing steps: 4, 8, 12, 16, 24, 32, 48, 72, 112 px.
- Left-align text. Centre only very short lines.
- Content width max 1120px, with 20px side padding on phones.

## Motion

- Daksha's eyes follow the pointer. Daksha blinks now and then.
- Things a person opens or closes may animate for 150 to 200ms.
- In the app, nothing fades or slides in on scroll.
- The landing page is the exception, because it has to win attention. There, Daksha also breathes and hops when pressed, the hero title rises in when the page opens, sections rise or wipe into view as you scroll, a slow ribbon lists what Daksha does, the "How it works" phone changes screen as you read each step, and the hero drifts a little as you scroll (only in browsers with scroll-linked animation). Everything is visible without the script; the reveals only hide content once the page's JavaScript is running.
- With `prefers-reduced-motion`, all motion stops and Daksha's eyes rest in the centre. On the landing page the ribbon becomes a still, wrapped list.

## Patterns that carry trust

Build these the same way everywhere.

**Answer with sources.** Every answer from Daksha ends with small mint chips, one per source, each saying what it is and when ("Journal, 14 March"). Pressing a chip opens the original. An answer with no source is not allowed; Daksha says "I don't have anything about that yet."

**Memory card.** One thing Daksha knows, in one sentence, with where it learned it, and two actions: "Fix this" and "Forget this".

**Permission ask.** Before Daksha reads from a new place or does something outside Daksha: what it wants, why, and two equal buttons. "Not now" is never smaller or greyer than "Allow".

**Activity record.** A plain list of what Daksha read and did, newest first. No hiding, no "advanced" tab.

**Status label.** Anything planned but not built is labelled "Coming later". Never show a feature as live when it is not.

## Accessibility floor

- WCAG 2.1 AA contrast everywhere.
- Every action works with a keyboard. Focus ring: 3px ink outline with 3px offset.
- Touch targets at least 44 by 44px.
- Every input has a visible label. Placeholder text is not a label.
- Meaning never depends on colour alone.
- The mascot is decorative: `aria-hidden="true"`.

## Do not

- No dark mode in the app until the light theme is finished and tested. Then design it on purpose. (The landing page has one, designed on purpose; see above.)
- No stock photos, no AI-made illustrations of people.
- No fake chat bubbles pretending to be real users.
- No more than one primary button on a screen.
