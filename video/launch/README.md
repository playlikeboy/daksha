# Debo launch video

A 69 second launch film (1920x1080, plus a 1080x1920 cut) and a 66 second demo walkthrough (1920x1080). Both have music and sound effects, and no speech.

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

The walkthrough is one real screen recording of the app (the demo account), shown on a phone on the right with a caption for each step on the left. Waits are sped up and long pauses are cut; a label by the phone always says the speed. The recording is 390x844 at 24 fps (it was stored in the top-left corner of a 780x1688 frame, so crop it first):

```
ffmpeg -i recording.mp4 -vf "crop=390:844:0:0,scale=780:1688:flags=lanczos" -q:v 2 build/demo-frames/%06d.jpg
node video/launch/render.mjs --edit demo --web apps/web --cap video/launch/build/demo-frames --out video/launch/build/out --workers 8
ffmpeg -framerate 30 -i build/out/frames-demo/%05d.jpg -i build/audio/demo.wav -map 0:v -map 1:a -vf "scale=in_range=pc:out_range=tv,format=yuv420p" -c:v libx264 -preset slow -crf 20 -maxrate 6M -bufsize 12M -color_range tv -c:a aac -b:a 160k -movflags +faststart -shortest apps/site/public/debo-demo.mp4
ffmpeg -i apps/site/public/debo-demo.mp4 -c:v libvpx-vp9 -crf 35 -b:v 0 -row-mt 1 -pix_fmt yuv420p -c:a libopus -b:a 128k apps/site/public/debo-demo.webm
ffmpeg -ss 27.5 -i apps/site/public/debo-demo.mp4 -frames:v 1 -vf scale=1280:-1 -c:v libwebp -quality 85 apps/site/public/debo-demo-poster.webp
```

If the recording changes, change the `src` times in `demo/timeline.js`, and the tap times in `tapsSrc`.

## Rules the edit keeps

- The footage is 780 px wide and is never shown larger than 1:1 (camera scale is 1.0 or less).
- No speech at all, no numbers, no quotes from users. Hindi voice is not shown, because it is not verified with real speech.
- If the recording changes, adjust the cut points in `src/timeline.js`. They follow the `marks.json` names where possible.
- The fonts in `assets/` are Figtree (SIL Open Font License).
