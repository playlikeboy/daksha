# Journal recordings: voice notes, videos and speaking

Status: built and run end to end in sample mode with a fake bucket and a fake speech engine, and in tests with a fake Worker standing in for Cloudflare (14 November 2026). **Not yet run against real R2 or real Workers AI.** See "Not checked yet" at the end.

This is what the Journal screen does beyond typing, how it is stored, what it costs, and what is needed to make it work. On Cloudflare it needs no owner-made keys or tokens, only the two bindings in `api/wrangler.jsonc`.

## What a person can do

- **Write.** One calm box that grows as you write. The draft is kept on the device (browser storage on the web, a small file on the phone) and comes back after a restart. A quiet "Saved on this device" line, a word count, a day you can change ("When did this happen?"), and Ctrl or Command with Enter to save on the web.
- **Speak.** Dictate into the text. A "Listening" box with a Stop button shows the whole time the microphone is on.
- **Record.** A voice note, or a video where the browser can record one. On the phone app, both (see "Phone" below). Listen or watch before saving. Progress is shown while it uploads.
- **Add a recording.** Pick an audio or video file you already have. Same review step.

Limits, stated on screen and enforced on the server: **200 MB and 60 minutes per recording; 40 recordings and 4 hours a day** (the day changes at midnight UTC). Allowed types: m4a, mp4, mp3, wav, webm, ogg, aac, flac, 3gp, mov (`apps/server/src/debo/media-limits.ts`).

## Choices, and why

### Writing surface: a plain text box

Chosen: React Native's `TextInput`, multiline, growing with its content, with type size and spacing from the design tokens.
Why: the rich-text editors that work on both web and phone either need a custom native build (for example `react-native-enriched`) or run inside a web view (Lexical, TenTap). A web view is fragile for typing on a phone, and a custom native build is a heavy step for light bold and bullets. A plain box is the same everywhere and never loses a word. Light formatting can come later if it proves its worth.

### Speaking: short clips to Debo's own endpoint

Chosen: record clips of about 8 seconds with the browser's `MediaRecorder`, send each to `POST /api/debo/transcribe`, put the words in the text at the cursor.
Why not the browser's built-in speech recognition: it differs by browser (Chrome sends audio to Google, Safari to Apple, Firefox has none), and it handles Hindi and mixed speech unevenly. One path through Debo's endpoint behaves the same on every browser, uses the same company as recordings (Cloudflare), and the privacy page can say so in one place.
Cost of this choice: words appear a few seconds after you speak, not as you speak, and there is a gap of a few milliseconds between clips.
Limits: 30 clips a minute and 600 a day per person (about 100 minutes), in server memory, so a restart resets them. Dictation does not count against the daily AI token limit, because it uses a different service with its own cost. Clips are not stored.
On the phone: not built. Use the microphone on the keyboard to dictate. In-app dictation would record short clips with `expo-audio` (now in the app for recordings) and send them the same way; it is not written yet.

### Upload route: through the API, into R2 by binding (default)

Chosen: the API Worker binds the private bucket (`MEDIA`) and Workers AI (`AI`). The API runs in a container, and the container reaches them through two made-up private hosts that the Worker answers (outbound interception, the same trick used for `browser.internal`): `http://media.internal` (the bucket) and `http://ai.internal` (Whisper). Code: `os/infra/cloudflare/api/src/media.ts` (the handlers), `apps/server/src/debo/binding-store.ts` (the server side).
Why: nobody has to make R2 keys or an AI token, so there is no secret to leak or rotate. R2 binding calls need no signatures.
There are no presigned links in this mode, so the app sends the file to Debo's API and plays from it. The "links" the API hands out look the same as before, but point at `https://api.debo.life/api/media-blob/<token>`:
- A token names one action on one object (put, one part, or get), the exact size for uploads, and an expiry (2 hours to upload, 1 hour to play, 24 hours for the data download). It is signed with a key derived from `SESSION_SIGNING_KEY`, so it survives a container restart and nobody can make one. It works as a plain link, so `<audio>`, `<video>` and the phone player need no sign-in header.
- The API only issues a token after checking the recording's owner, exactly as before. Someone else's id gets "I couldn't find that recording".
- Bodies are streamed: browser to API to Worker to R2, never held whole in memory. An upload without a declared length is refused (411), as is a length different from the signed size.
- Playback supports HTTP `Range`, so audio and video can seek. The API passes the range to the Worker, which uses R2's range reads.
- These routes sit before the API's general 12 MB request limit and its per-address limit, because the token is the check and a recording is many requests. Everything else keeps both.
- Part size is 8 MiB in this mode (a 200 MB file is at most 25 parts; R2 needs at least 5 MiB for all parts but the last, and all equal). Files up to 32 MB go up in one request. Each part is retried up to three times by the app.
- `media.internal` accepts only keys shaped `<owner id>/<random id>.<ext>`, so even a bug in the API cannot name anything else.
Presigned mode is still there. If `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` are all set, the API uses it instead: the app talks to R2 directly with signed links (2 hour upload, 1 hour playback, signed for the exact size), 16 MB parts, and the API never carries the bytes. That needs an R2 API token and the bucket CORS rule below. It uses [`aws4fetch`](https://github.com/mhart/aws4fetch) (about 3 KB, no AWS SDK). How it is chosen: keys present means presigned; else `MEDIA_BACKEND=binding` (which the Worker sets when it has the `MEDIA` binding) means binding; else no recordings.
How it stays private (both modes): the bucket has no public address and no custom domain; object names are made on the server; every call looks the recording up by owner first; after upload the server checks the real size with a HEAD and deletes the file if it is wrong or over the limit.

### Transcription: Cloudflare Workers AI Whisper

Chosen: `@cf/openai/whisper-large-v3-turbo`, through the Worker's `AI` binding (host `ai.internal`, same inputs as the REST API; with `CF_AI_API_TOKEN` set it uses the REST API instead) ([model page](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)). It takes base64 audio and returns text, segments with start and end times, and the detected language.
Why: the account is already on Cloudflare, so no new company hears the audio, and the price is low (below). The model detects the language, so English, Hindi and a mix work as well as Whisper allows. Voice-activity filtering is on, so silence does not turn into invented words. Hindi comes back in Devanagari script.
Behind a small interface (`Transcriber` in `transcriber.ts`) with a fake for tests: another engine (Deepgram and others) can replace it by writing one function.
Long audio: the model page gives no file size or length limit (for the binding either), so we do not rely on one. ffmpeg first turns the file into a small mono 16 kHz mp3 (for video, only the sound is kept: `-vn`). The mp3 is cut into 5 minute pieces that overlap by 4 seconds. Each piece is written out (two at a time) and the pieces are joined at the middle of each overlap, so no words repeat or drop. Segment times are kept in the database. Paragraph breaks go at pauses of 2 seconds or more.
The same file added twice is written out once (a SHA-256 of the file is kept, per person).

## How a recording is saved

1. `POST /api/debo/media/uploads` checks type, size, length and the daily limit, makes the object name, and returns upload links. A `media` row is made with `upload_state = uploading`. No entry exists yet.
2. The app sends the file to R2.
3. `POST /api/debo/media/uploads/:id/complete` (with the part tags for a multipart upload) joins the parts, checks the size, and in one step creates the entry (a row in `sources`, kind `voice` or `video`) and sets the transcript to `waiting`. The save never waits for the words.
4. In the background the server downloads a temporary copy, makes the transcript, and saves it: the media row, the entry's text and its pieces for search, in one transaction. Then the entry is made searchable by meaning and sent to memory, the same as a written entry. The temporary copy is deleted.
5. If it fails, the transcript is `failed` with a short reason. The entry stays and can be played. "Try again" (`POST /api/debo/entries/:id/transcript/retry`) puts it back in the queue.
6. If the server stops mid-way, a sweep every 5 minutes picks up `waiting` jobs and jobs stuck `working` for over 10 minutes (at most 4 tries), and clears uploads nobody finished after a day. The existing 5 minute cron already wakes the container.

Transcript states: `waiting`, `working`, `ready`, `failed`. A recording with no speech is `ready` with empty text; the card says "I didn't hear any words in this recording."

## Data model

One new table, `media` (migration `0005_journal_media.sql`). The words stay in `sources.text`, so search, answers with sources, memories, export and delete need no change. `sources.kind` is a plain text column: `voice` and `video` need no migration.

| Column | What |
|---|---|
| `id`, `user_id`, `source_id` | the recording, its owner (cascade delete), its entry (cascade delete; empty until the upload finishes) |
| `kind` | `voice` or `video` |
| `object_key`, `mime_type`, `size_bytes` | where the file is, what it is, how big |
| `duration_ms`, `recorded_at` | length and when it was recorded |
| `device` (jsonb) | only `origin` (recorded or picked), the file name and the file's last-changed time. Never location |
| `upload_state`, `upload_id` | `uploading` or `stored`; the open multipart upload |
| `transcript_status`, `transcript_error`, `transcript_attempts`, `transcript_started_at` | the queue state |
| `language`, `segments` (jsonb) | detected language; `[{start, end, text}]` |
| `content_hash` | SHA-256 of the file |

**What the migration does when CI applies it** (`deploy.yml` runs `pnpm --filter @debo/db db:migrate` on every push to main): one `CREATE TABLE "media"`, two `ALTER TABLE "media" ADD CONSTRAINT … FOREIGN KEY` (to the Neon Auth user and to `sources`), and four `CREATE INDEX` on `media`. It does not touch `sources`, `chunks` or any existing table, drops nothing, and rewrites no row. `tests/journal-media.test.ts` fails if a later migration adds a `DROP`. The web app and the new app both keep working on the old schema until it runs; the recording routes need the table.

## Routes (all under `/api/debo`, owner only, input checked with Zod)

| Route | What |
|---|---|
| `GET /status` | now also `recordings`, `speaking` and the limits |
| `POST /media/uploads` | start an upload; returns links |
| `POST /media/uploads/:id/complete` | finish; saves the entry |
| `GET /entries/:id/playback` | a one-hour link to play the recording |
| `PUT /api/media-blob/:token`, `GET /api/media-blob/:token` | binding mode only: upload a file or part, play with Range. The signed token is the sign-in |
| `GET /entries/:id/transcript` | status, words, language, timed segments |
| `POST /entries/:id/transcript/retry` | try the words again |
| `POST /transcribe` | dictation: one short clip in, words out. Not stored. Max 3 MB |
| `DELETE /entries/:id` | existing; deletes the file first, then the entry |

Transcript text, file names and audio are never logged. Logs carry ids, counts and error names only.

## Delete and export

- Deleting an entry deletes its R2 object first. If that fails the entry stays, so nothing is left behind unseen.
- "Delete my data" deletes every recording, including unfinished uploads, and everything else under the person's folder in the bucket.
- "Download my data" includes, for each recording: its details, the transcript, the timed segments, and a link that downloads the file, valid for 24 hours. The file itself is not inside the JSON.

## Costs

Prices checked on 14 November 2026. They change: check the pages.

| Item | Price | Source |
|---|---|---|
| Writing out speech (Whisper large v3 turbo) | $0.000513 per audio minute | [model page](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/) |
| R2 storage | $0.015 per GB-month (first 10 GB-month free) | [R2 pricing](https://developers.cloudflare.com/r2/pricing/) |
| R2 writes (Class A) | $4.50 per million (first million a month free) | same |
| R2 reads (Class B) | $0.36 per million (first 10 million free) | same |
| R2 download to the internet | free | same |

Examples: one hour of speech costs about $0.03 to write out. A person at the daily cap (4 hours) costs at most about $0.12 a day. A 1-hour voice note is roughly 15 MB as webm or 60 MB as m4a, so 100 hours of notes is a few GB, under $0.10 a month after the free 10 GB. An upload costs a handful of write operations (one, plus one per part: 8 MiB through the binding, 16 MB in presigned mode). Binding calls bill like the same R2 operations. Workers AI through the binding is billed at the same per-minute price. In binding mode the bytes also pass through the API Worker and container, so download is no longer straight from R2: R2 itself does not charge for it, and Workers requests are billed per request, not per byte (check [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)). Dictation costs the same per minute as recordings. The API container's CPU for ffmpeg is on top and has not been measured.

## Setup

Nothing to create by hand, apart from the bucket, which already exists (`debo-journal-media`, private, location apac).

1. **Deploy.** Push to main. `deploy.yml` applies the migration; `deploy-os.yml` builds the API image (with ffmpeg), and `wrangler deploy` attaches the two bindings declared in `api/wrangler.jsonc` (`r2_buckets` to `debo-journal-media`, `ai`). The Worker then passes `MEDIA_BACKEND=binding` and `AI_BACKEND=binding` to the container, and the Journal shows Speak, Record and Add. The deploy token (`CLOUDFLARE_API_TOKEN`) must be allowed to attach R2 buckets and Workers AI to a Worker; if the deploy fails with a permission error, add those to the token.
2. **Check by hand** (see "Not checked yet"): add a short voice note at https://my.debo.life, see the words appear, play it and seek, delete it, and look in the bucket to see the object is gone.
3. **Bucket CORS** is only needed in presigned mode (the browser then talks to R2 directly). The existing rule for `https://my.debo.life` stays. Dashboard: R2, the bucket, Settings, CORS Policy, JSON tab:
   ```json
   [
     {
       "AllowedOrigins": ["https://my.debo.life"],
       "AllowedMethods": ["GET", "HEAD", "PUT"],
       "AllowedHeaders": ["Content-Type", "Content-Length"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
4. **Optional, presigned mode:** make an R2 token (Object Read & Write, scoped to the bucket) and `gh secret set R2_ACCESS_KEY_ID`, `gh secret set R2_SECRET_ACCESS_KEY`; optionally a Workers AI token as `CF_AI_API_TOKEN`. Names only here; set the values yourself, never in a file.
5. Optional: an R2 lifecycle rule to abort incomplete multipart uploads sooner than R2's default of 7 days. The server already clears its own unfinished uploads after a day.

## Phone (iOS and Android)

Built (15 November 2026), in `debo-capture.native.ts` and `debo-player.native.tsx`, with the same names the web version exports, so the Journal screens are unchanged:
- **Record a voice note** with `expo-audio` 1.1.x: mono AAC in an `.m4a` file (`audio/mp4`) at 64 kbps, about 30 MB for an hour. The microphone permission is asked when "Record your voice" is pressed.
- **Record a video** with `expo-camera` 17.0.x: the front camera, 720p, shown while it records (`LivePreview`). Recording starts when the camera says it is ready, and stops itself at 200 MB. Android gives `video/mp4`, iPhone `video/quicktime` (`.mov`); both are allowed types. Camera and microphone permissions are asked when "Record a video" is pressed.
- **Pick a file** (`expo-document-picker`), as before.
- **Upload** through the same path as the web: `POST /api/debo/media/uploads`, then one PUT (single link, `expo-file-system`'s upload task) or 8 MiB parts (bytes read with `File.open()`), then `complete`. Nothing is sent before "Save recording".
- **Listen or watch first, and play saved ones:** a voice note plays in the app (`expo-audio`: Play, Pause, Back 15 seconds, and the time). A video plays in a small web view with the phone's own video controls and no scripts. A saved recording asks for its one-hour link when Play is pressed, as on the web.
- **On the phone itself:** a recording made in the app is written to Debo's cache folder (only this app can read it). One that is cancelled is deleted at once. One that is kept stays there until the phone clears the cache: it is not deleted straight after saving, because the upload may still be running if the screen was closed.
- The permission texts in `app.json` (the WebRTC, `expo-audio` and `expo-camera` plugins) say the microphone is used only for a call or a note, the sound of a call is never kept, and a note is kept until it is deleted.
Not built: dictation (the keyboard's microphone is used instead), and a way to pause a recording.
Not run on a device or simulator. Checked: `tsc`, `expo export` for Android and web, and `expo prebuild` for Android (the camera and microphone permissions). The Android APK from `.github/workflows/release-mobile.yml` (see `apps/mobile/README.md`) includes recording from the first build after this change. Not checked: that recording, the camera preview, playback of a local video in the web view on Android, and seeking work on real phones; iPhone at all (no signed build exists).

## Not checked yet

- **Binding mode on real Cloudflare.** Tested only against fakes of `media.internal`, `ai.internal`, R2 and Workers AI. Not confirmed on the real platform: that a request body streams through outbound interception without being buffered or cut; that R2's `put` and `uploadPart` take the forwarded stream (they need a known length, so the API sets `Content-Length`; a body without one is buffered up to 16 MB in the Worker); that 8 MiB parts and 32 MB single uploads pass every hop; that range reads work for seeking; the AI binding's accepted audio size (5 minute mp3 pieces are about 1.2 MB, about 1.6 MB as base64); and that the deploy token may attach the bindings. If streaming through interception fails, lower `singleMaxBytes` and `partBytes` for the binding (in `mediaFromEnv`) so bodies stay small, or fall back to presigned mode.
- Presigned mode, if used: that presigned PUT links with a signed `Content-Length` and `Content-Type` are accepted, that presigned multipart `UploadPart` links work (R2's S3 page lists the operations but does not mention presigned part links), and that CORS and the exposed ETag work from `my.debo.life`. If R2 refuses a signed `Content-Length`, remove it from `beginUpload` in `object-store.ts`.
- Real Workers AI quality and the shape of the binding's answer (read the same way as the REST answer, inside a `{ success, result }` wrapper made by the Worker).
- ffmpeg inside the container (the Docker image was not built here), and CPU time for an hour of audio on the small instance.
- Whisper quality on Hindi and mixed speech.
- iOS Safari recording (it records `audio/mp4`; not run), and Firefox.
- Phone code (above).
