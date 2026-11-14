# Debo launch video

A 69 second, silent launch film (1920x1080, plus a 1080x1920 cut). The edit is a web page driven by a clock: `src/engine.js` draws every frame as a function of time, `src/timeline.js` holds the whole edit (cuts, speed ramps, camera moves, text, callouts). `render.mjs` steps through it at 30 fps with Playwright and encodes with ffmpeg.

The footage is recorded fresh from the live app, so the video can be remade when the app changes.

## Remake it

You need Node 22, ffmpeg (with libx264 and libvpx-vp9), and the Playwright that ships with `apps/web` (`pnpm install` at the repo root).

1. Record the app clips (the demo account only; the sample journal entry is deleted at the end):

   ```
   DEBO_DEMO_EMAIL=... DEBO_DEMO_PASSWORD=... node video/launch/capture/record.mjs apps/web video/launch/build/capture
   ```

   This writes `build/capture/clips/all/*.jpg` (780x1688, 2x scale), `stamps.json` and `marks.json`. It does not ask about mail or calendar and presses nothing under connected apps.

2. Render:

   ```
   node video/launch/render.mjs --web apps/web --cap video/launch/build/capture --out video/launch/build/out --workers 8
   node video/launch/render.mjs --web apps/web --cap video/launch/build/capture --out video/launch/build/out --workers 8 --layout v
   ```

   Set `FFMPEG=/path/to/ffmpeg` if ffmpeg is not on your PATH. `--only 12,30.5` renders just those seconds as JPEGs, for checking.

3. Check the result by eye (a contact sheet with one frame per second is enough), then make the web files:

   ```
   ffmpeg -i build/out/launch-h.mp4 -c:v libvpx-vp9 -crf 34 -b:v 0 -row-mt 1 -an apps/site/public/debo-launch.webm
   ```

   The poster is the frame at 11.5 s. Copy `launch-h.mp4` to `apps/site/public/debo-launch.mp4`.

## Rules the edit keeps

- The footage is 780 px wide and is never shown larger than 1:1 (camera scale is 1.0 or less).
- No fake speech, no numbers, no quotes from users. Hindi voice is not shown, because it is not verified with real speech.
- If the recording changes, adjust the cut points in `src/timeline.js`. They follow the `marks.json` names where possible.
- The fonts in `assets/` are Figtree (SIL Open Font License).
