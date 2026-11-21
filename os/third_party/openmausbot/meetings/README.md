# Meeting notes bot: copied, not wired yet

These files are OpenMausBot's meeting bot (`server/meetings/*` at `da592ee7251ae853e33f6d837433fd144ca3e333`, Apache-2.0, see `../LICENSE`). Parts of `meetbot.ts` adapt Vexa (Apache-2.0, see `../../vexa/LICENSE`). They are copied byte for byte and nothing in Daksha imports them. TypeScript, the tests and the linter all skip this folder.

## Why it is not wired

The bot is not a small library. `meetbot.ts` runs on its own computer: headed Chrome joins the call as a guest, a PulseAudio null sink takes the call's audio, and ffmpeg turns it into 16 kHz PCM for speech-to-text. Daksha's server runs on Render and Cloudflare containers, which have no display, no PulseAudio and no Chrome. The browser worker (`os/apps/worker`) has Playwright but no audio. The other files also import about a dozen OpenMausBot modules (`shared/meetings.ts`, `shared/widget.ts`, `outbound-hold.ts`, `harness/http.ts`, `routes/table.ts` and more) that Daksha does not have.

Wiring it in cleanly needs the steps below. Each one is its own change.

## Plan

1. **A meeting computer.** A container image with Chrome (headed under Xvfb), PulseAudio, ffmpeg and Node 24, started for each meeting and stopped after it. The image runs `meetbot.ts run <dir>` unchanged. A Cloudflare Container or a Fly machine is the likely home. This costs money per meeting minute, so it needs the owner's go-ahead.
2. **Speech-to-text.** Use the `chunks` mode, so the server transcribes with the speech key Daksha already has. No new provider is needed.
3. **Server side.** Port `manager.ts`, `engine.ts`, `prompt.ts` and `cards.ts` into `os/apps/server/src/meetings/`. Replace the OpenMausBot imports with Daksha's: records for state, `agent.createTask` for the summary, and the journal (`debo`) for the notes. Keep the Apache headers and mark each changed file.
4. **Consent, always.**
   - The meeting bot is off by default.
   - Joining needs a "Everyone in this meeting knows it is being recorded" tick, every time.
   - The bot posts "Daksha notes bot is recording" in the meeting chat and says it out loud. Without that message landing, it records nothing and leaves. That is upstream's `consent` rule, kept.
   - Audio is never stored. Only the transcript and the notes are kept, and they are saved to the journal as one source the person can delete.
5. **Tool and app.** A `join_meeting` tool and a Settings or Chat card that takes a Meet, Teams or Jitsi link. Both go through a review tap, because the bot speaks inside someone else's meeting (decision 28).
6. **Privacy page.** List the meeting computer's host and the speech provider for meeting audio.

Until then, the privacy page says meeting notes are not offered.
