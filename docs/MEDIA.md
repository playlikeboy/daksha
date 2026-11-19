# Pictures and the walkthrough film

How to take the app screenshots on the landing page (`apps/site`) and the pitch site (`apps/pitch`), and how to make the walkthrough film, again. Everything comes from the app in demo mode, so it shows only made-up content. Never use a real account for these.

## What is where

| File | Shows | Used by |
|---|---|---|
| `apps/site/public/shots/journal-light.webp` | Journal, the writing box | Landing page, "How it works", step 1 |
| `apps/site/public/shots/chat-light.webp` | Chat before you ask anything | Landing page, step 2 |
| `apps/site/public/shots/knows-light.webp` | What Debo knows | Landing page, step 3, and the share picture |
| `apps/site/public/shots/talk-light.webp` | Talk, before a call, with a card waiting for a yes | Landing page, step 4 |
| `apps/site/public/shots/apps-light.webp` | Apps | Not on the page today; kept with the set |
| `apps/pitch/public/shots/*.webp` | Crops of the same screens (journal list, knows, talk, apps) | Pitch site, "Product" |
| `apps/pitch/public/shots/chat-light.webp` | A real answer with a source chip | Pitch site hero and "Product". Not retaken (see below) |
| `og.png` in `apps/site`, `apps/web`, `apps/pitch`, `os/apps/mobile` | The share picture, with the knows screenshot | Link previews |
| `apps/site/public/debo-demo.mp4`, `.webm`, `-poster.webp`, `.en.vtt` | The walkthrough film | Landing page, `src/media.ts` |

- Landing page shots are 780x1688: the phone size 390x844 at 2x. Keep that size; the page reserves that shape, so a new size would make the page jump.
- Pitch shots are 780 wide crops with fixed heights (journal 933, knows 1067, talk 833, apps 1067, chat 767). `deck.tsx` lists the sizes.
- Both sites use WebP only.
- Change the `alt` text in `showcase.tsx` and `deck.tsx` with the picture. It must say what the picture really shows.

## 1. Start the app in demo mode

Follow "Screenshots with made-up content" in `os/docs/UI-AUDIT.md`: start the demo API (`pnpm dev:ui-demo` in `os/`, on 127.0.0.1:8788) and export the web app against it. Restart the demo API before each run: the welcome only shows once, and a run adds a journal entry.

## 2. Take the pictures and the clips

From `os/`:

```sh
export TMPDIR=/home/kunalkashyap8024/tmp   # only on the slow shared disk
export UI_SHOTS_CHROMIUM=~/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell   # if Playwright has no browser of its own
node scripts/site-media.mjs artifacts/site-media shots
# restart the demo API here
node scripts/site-media.mjs artifacts/site-media clips
```

- `shots/` gets one PNG per screen: welcome, chat, journal, journal-list, journal-entry, recorder, knows, talk, tasks, apps, reminders, custom-people, avatar-builder. `SHOTS=knows,talk` takes only those.
- `clips/` gets the short recordings for the film, and `clips.json` says how long each frame stays on screen. `CLIPS=write` records only that one.
- The browser has a fake microphone, so the recorder shows a recording in progress. Reduce motion is on, so pictures are steady.
- The only things typed are made up: a journal entry about coffee with Sam, and a person called Coach Sam.

## 3. Make the web files

```sh
cd artifacts/site-media
S=../../../apps/site/public/shots; P=../../../apps/pitch/public/shots
for n in journal chat knows talk apps; do ffmpeg -y -i shots/$n.png -c:v libwebp -quality 82 -compression_level 6 $S/$n-light.webp; done
ffmpeg -y -i shots/journal-list.png -vf crop=780:933:0:360  -c:v libwebp -quality 82 $P/journal-light.webp
ffmpeg -y -i shots/knows.png        -vf crop=780:1067:0:112 -c:v libwebp -quality 82 $P/knows-light.webp
ffmpeg -y -i shots/talk.png         -vf crop=780:833:0:86   -c:v libwebp -quality 82 $P/talk-light.webp
ffmpeg -y -i shots/apps.png         -vf crop=780:1067:0:112 -c:v libwebp -quality 82 $P/apps-light.webp
```

Then the share picture, from the repo root: `node scripts/og/build-og.mjs`. Raise the `?v=` number after `og.png` (in the site, pitch and web layouts, `apps/site/src/app/page.tsx` and `os/apps/mobile/public/index.html`) so link previews fetch the new one.

## 4. Make the walkthrough film

The film is drawn by `video/launch/demo/` (see `video/launch/README.md`): the clips play in a phone on a soft background, with a caption for each step on the left, a chip that says "Sample entries", and music and sounds from `video/launch/audio/make-audio.py`. `demo/timeline.js` lists the clips, how long each stays on screen, and the step captions.

From the repo root:

```sh
node video/launch/render.mjs --edit demo --web $PWD/apps/web --cap $PWD/os/artifacts/site-media --out video/launch/build/out --workers 6
python3 video/launch/audio/make-audio.py --out video/launch/build/audio --only demo
ffmpeg -framerate 30 -i video/launch/build/out/frames-demo/%05d.jpg -i video/launch/build/audio/demo.wav -map 0:v -map 1:a -vf "scale=in_range=pc:out_range=tv,format=yuv420p" -c:v libx264 -preset slow -crf 20 -maxrate 6M -bufsize 12M -color_range tv -c:a aac -b:a 160k -movflags +faststart -shortest apps/site/public/debo-demo.mp4
ffmpeg -i apps/site/public/debo-demo.mp4 -c:v libvpx-vp9 -crf 35 -b:v 0 -row-mt 1 -pix_fmt yuv420p -c:a libopus -b:a 128k apps/site/public/debo-demo.webm
ffmpeg -ss 23 -i apps/site/public/debo-demo.mp4 -frames:v 1 -vf scale=1280:-1 -c:v libwebp -quality 85 apps/site/public/debo-demo-poster.webp
```

- `--only 8,30` renders just those seconds, for checking. A contact sheet is a quick check by eye: `ffmpeg -i apps/site/public/debo-demo.mp4 -vf "fps=0.5,scale=320:-1,tile=6x5" -frames:v 1 sheet.jpg`.
- Keep each file under 20 MB (Cloudflare serves static files up to 25 MiB). The November 2026 film is about 4.8 MB.
- If a clip's length or a caption changes, change `public/debo-demo.en.vtt` (only the words on screen, with times from `timeline.js`) and the walkthrough entry in `apps/site/src/media.ts`: `description`, `seconds` and `uploaded`.

## What demo mode cannot show

- **A chat answer with sources.** The demo agent does not call a model, so it cannot answer from the journal. The landing page shows the empty chat, and the pitch site keeps its older real answer (`chat-light.webp`). Retake both when a demo with a model is safe to run.
- **A live voice call and the call bubble.** These need LiveKit and a microphone that speaks.
- **Connected apps.** Gmail and Calendar show example data only.
