# Daksha launch video

The site shows the second launch film (`film2/`, 72 seconds, 1920x1080 plus a 1080x1920 cut): an animation with no screen recordings. There is also the first launch film (`src/`, 69 seconds, cut from screen recordings) and a 58 second app walkthrough (`demo/`, 1920x1080). All have music and sound effects, and no speech.

## The second launch film (film2)

Bright white screen, a soft blue glow at the bottom, words that build one at a time with small icons between them, and cards rebuilt from the app (not screenshots) that float, tilt and stack. A line comes back between the cards: "Daksha remembers your days", "Daksha answers from your journal", "Daksha shows you what it knows", "Daksha talks with you", "Daksha remembers your people", "Daksha asks before it acts", and it ends on "Daksha keeps you in control".

- `film2/timeline.js` holds every time: the word blocks, the card scenes and the sound cues.
- `film2/engine.js` draws a frame for any time t. The card text uses the app's real words ("Looking through your journal…", "Waiting for your yes", "Approve", "Not now", "Fix this memory", "Forget this memory", "Journal, 12 November").
- The characters are `docs/assets/avatar-*.svg` and the end card logo is `docs/assets/debo.svg`. App icons are simple drawings of our own, not brand logos.
- Everything on screen is something the app does today (see `os/docs/FEATURES.md`). The names and entries are the made-up sample text used in the demo. If a card's feature changes, change the card.

Remake it (no recording needed; keep temporary files off a full disk with `TMPDIR`):

```
node video/launch/render.mjs --edit film2 --web apps/web --out video/launch/build/out --workers 8
node video/launch/render.mjs --edit film2 --web apps/web --out video/launch/build/out --workers 8 --layout v
python3 video/launch/audio/make-audio.py --out video/launch/build/audio --only film2
```

This writes `build/out/film2-h.mp4`, `build/out/film2-v.mp4` and `build/audio/film2.wav`. `--only 12,30.5` renders just those seconds as JPEGs, for checking. Then make the published files (TV range, sound added, fast start):

```
cd video/launch/build
ffmpeg -i out/film2-h.mp4 -i audio/film2.wav -map 0:v -map 1:a -vf "scale=in_range=pc:out_range=tv,format=yuv420p" -c:v libx264 -preset slow -crf 20 -maxrate 6M -bufsize 12M -color_range tv -c:a aac -b:a 160k -movflags +faststart -shortest ../../../apps/site/public/debo-launch.mp4
ffmpeg -i out/film2-v.mp4 -i audio/film2.wav -map 0:v -map 1:a -vf "scale=in_range=pc:out_range=tv,format=yuv420p" -c:v libx264 -preset slow -crf 20 -maxrate 6M -bufsize 12M -color_range tv -c:a aac -b:a 160k -movflags +faststart -shortest ../../../apps/site/public/debo-launch-vertical.mp4
ffmpeg -i ../../../apps/site/public/debo-launch.mp4 -c:v libvpx-vp9 -crf 35 -b:v 0 -row-mt 1 -pix_fmt yuv420p -c:a libopus -b:a 128k ../../../apps/site/public/debo-launch.webm
ffmpeg -ss 22.5 -i ../../../apps/site/public/debo-launch.mp4 -frames:v 1 -vf scale=1280:-1 -c:v libwebp -quality 85 ../../../apps/site/public/debo-launch-poster.webp
```

Check it by eye: a contact sheet with one frame a second (`ffmpeg -i film2-h.mp4 -vf "fps=1,scale=384:-1,tile=8x9" -frames:v 1 sheet.jpg`), and a few short stretches frame by frame for smooth motion.

The music for film2 is brighter and faster than the first film: D major, about 120 beats a minute, plucks, marimba, bass, kick, claps and hats. The beat drops on the first "Daksha remembers", rests during the voice call, and stops for the last line. Sounds follow the cues in the timeline: pops on words, ticks while typing, whooshes on card moves, taps on buttons, flaps on the calendar flip, a tick and chime on the check, and sparkles on the confetti.

## The first launch film

The steps below make the first film. They write the same file names in `apps/site/public` as film2, so publish only one of the two.

Each edit is a web page driven by a clock: `src/engine.js` draws every frame of the film as a function of time, and `src/timeline.js` holds the whole edit (cuts, speed ramps, camera moves, text, callouts). The walkthrough works the same way from `demo/engine.js` and `demo/timeline.js`. `render.mjs` steps through a page at 30 fps with Playwright and encodes with ffmpeg. `audio/make-audio.py` makes the sound for both from the same timelines.

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

3. The renderer writes full-range JPEG colour, so re-encode each cut to the standard TV range before you publish it (otherwise the file reports `yuvj420p`):

   ```
   ffmpeg -i build/out/launch-h.mp4 -vf "scale=in_range=pc:out_range=tv,format=yuv420p" -c:v libx264 -preset slow -crf 20 -maxrate 6M -bufsize 12M -color_range tv -movflags +faststart final-h.mp4
   ```

   Do the same for the vertical cut (`launch-v.mp4` to `final-v.mp4`).

4. Check the result by eye (a contact sheet with one frame per second is enough), then make the web files from `final-h.mp4`:

   ```
   ffmpeg -i final-h.mp4 -c:v libvpx-vp9 -crf 35 -b:v 0 -row-mt 1 -an -pix_fmt yuv420p apps/site/public/debo-launch.webm
   ffmpeg -ss 6.2 -i final-h.mp4 -frames:v 1 -vf scale=1280:-1 -c:v libwebp -quality 85 apps/site/public/debo-launch-poster.webp
   ```

   Then add the sound to both cuts as shown under "Sound" below (this also puts them in `apps/site/public`).

## Sound

All music and sound effects are made by `audio/make-audio.py` from sine waves and noise. No samples or recordings are used, so there is nothing to license (see `AUDIO.md`). The music is a soft pad, a plucked arpeggio, bass and a light beat in F major, at about 106 beats a minute. The sound effects are whooshes on cuts and wipes, pops when words and callouts appear, taps where a button is pressed in the recording, and a chime on the end card. The script reads both timelines, so if you change an edit, make the audio again:

```
python3 video/launch/audio/make-audio.py --out video/launch/build/audio
```

It writes `launch.wav` and `demo.wav` (48 kHz stereo, about -16 LUFS, true peak under -1.5 dBTP) and `cues.json`. Then add the sound to the finished video. The launch film's picture does not need to be made again:

```
ffmpeg -i final-h.mp4 -i build/audio/launch.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 160k -movflags +faststart -shortest apps/site/public/debo-launch.mp4
ffmpeg -i final-v.mp4 -i build/audio/launch.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 160k -movflags +faststart -shortest apps/site/public/debo-launch-vertical.mp4
ffmpeg -i apps/site/public/debo-launch.webm -i build/audio/launch.wav -map 0:v -map 1:a -c:v copy -c:a libopus -b:a 128k -shortest out.webm
```

Both cuts of the film share one edit, so they share one sound track.

## The demo walkthrough

The walkthrough plays short clips recorded from the app in demo mode, with made-up sample entries, in a phone on the right, with a caption for each step on the left and a chip that says "Sample entries". The clips are stop-motion: `os/scripts/site-media.mjs` takes a 780x1688 screenshot after each small step (a few letters typed, a little scroll) and notes how long each frame stays on screen. `demo/timeline.js` lists the clips and how long each is shown; the last frame of a clip stays if it is shown longer. How to record the clips and make the published files is in `docs/MEDIA.md`.

## Rules the edit keeps

- The footage is 780 px wide and is never shown larger than 1:1 (camera scale is 1.0 or less).
- The walkthrough shows only what the demo mode really shows. Nothing is drawn over the app's screens.
- No speech at all, no numbers, no quotes from users. Hindi voice is not shown, because it is not verified with real speech.
- If the recording changes, adjust the cut points in `src/timeline.js`. They follow the `marks.json` names where possible.
- The fonts in `assets/` are Figtree (SIL Open Font License).
