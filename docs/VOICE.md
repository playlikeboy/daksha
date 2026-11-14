# Voice

Status: built and deployed (decision 25). Verified on 14 November 2026 on debo.life with a browser's fake microphone: the token is signed, the `debo-voice` agent joins the room in `ap-south`, speaks its greeting with live captions, answers a typed question through `/api/voice/brain` with the right source chip ("Journal, 11 November") and speaks the answer, and "End conversation" turns the microphone off. Not yet verified: real speech, including mixed Hindi and English, and interrupting by voice.

## What the person gets

On `/home/voice` ("Talk to Debo") they press "Start talking", allow the microphone, and speak in English, Hindi or a mix. Debo answers out loud from their own entries and shows the source chips on screen. They can talk over Debo, press "Stop Debo", turn the microphone off, type instead, or end the conversation.

## How it works

```
Browser (/home/voice)                 debo.life (Cloudflare Worker)          LiveKit Cloud (ap-south)
  "Start talking"  ── POST /api/voice/token ──>  signs a 10-minute room token
                                                 identity = the person's user id
                                                 dispatches agent "debo-voice"
  mic audio  ─────────────── WebRTC ──────────────────────────────────>  apps/voice-agent
                                                                          Deepgram Nova-3 (multi) hears
                                                 POST /api/voice/brain <── question + recent turns
                                                 askStream (the one brain)  (Bearer VOICE_AGENT_SECRET)
                                                 NDJSON: sources, text ──>  Cartesia Sonic-3 speaks
  speaker, captions (lk.transcription), source chips (debo.sources)  <──
```

- **One brain.** The agent has no model of its own for answers: its `llmNode` streams from `/api/voice/brain`, which runs `askStream`, the same pipeline as chat. The daily limit, usage rows, the activity record, "I don't have anything about that yet" and small talk (decision 24) all behave the same as in chat.
- **Identity.** The browser never chooses who it is. `/api/voice/token` reads the session and puts the user id in the token as the participant identity. The agent passes that id to `/api/voice/brain` together with a shared secret that only the agent and the Worker know.
- **Models.** Speech to text: Deepgram Nova-3 with `language: "multi"` (English and Hindi, including switching mid-sentence), through LiveKit Inference. Text to speech: Cartesia Sonic-3, Hindi pronunciation by default (`VOICE_TTS_LANGUAGE=hi`), which also reads English. End of turn: LiveKit's turn detector. No extra provider keys: LiveKit Inference bills through the LiveKit project.
- **Interrupting.** Speaking over Debo stops it (LiveKit's interruption handling cancels the brain request). "Stop Debo" calls the agent's `debo.interrupt` RPC.
- **Transcripts (old web app only).** If "Keep voice transcripts" is on in Settings (the default), each exchange is saved as a chat, so it shows in Chat and can be deleted there. Audio is never stored by Debo. The Debo app in `os/` has no such setting: see "Voice calls are saved and learned from" below.
- **Follow-ups.** The agent sends the recent turns with each question. `askStream` does not use them yet (the brain work that adds history is in progress), so a follow-up like "and after that?" is searched on its own words for now.

## Running and deploying

- Secrets: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and `VOICE_AGENT_SECRET` are Worker secrets on `debo-web` and GitHub secrets. The agent gets `VOICE_AGENT_SECRET` and `DEBO_URL` as LiveKit agent secrets; LiveKit injects its own keys.
- `apps/voice-agent` is its own project, outside the pnpm workspace, because LiveKit Cloud builds it alone from its `Dockerfile` and `pnpm-lock.yaml`.
- Deploy a new version: `cd apps/voice-agent && lk agent deploy`. Status and logs: `lk agent status`, `lk agent logs`.

## Voice in the Debo app (`os/`)

The Debo app in `os/` (Hono server plus Expo app for iOS, Android and web) has its own voice popup (no tab: it opens from the microphone button in the chat box, or from `/talk`). It uses the same LiveKit agent (`apps/voice-agent`) and the same event format as the web app. Status: server and screen are built and tested with fakes; not yet tried against a live LiveKit room or on a phone.

- **Server** (`os/apps/server/src/voice/`):
  - `POST /api/voice/token`: needs a signed-in owner. Returns `{ url, room, token }`. The token lasts 10 minutes, opens one new room, uses the owner id as identity and dispatches `debo-voice`. It answers 503 "Talking to Debo is not set up yet." if any of the four variables below is missing (or the secret is under 32 characters).
  - `POST /api/voice/brain`: only the voice agent, with `Authorization: Bearer VOICE_AGENT_SECRET` (compared in constant time). Body `{ userId, sessionId, question, history }`. Streams NDJSON `sources`, `emotion`, `text`, `say`, `done`. It is mounted before the owner sign-in check because the agent has no owner session.
  - Both are limited by the server's general 120 requests a minute per address.
- **Variables** (set on the server; see `os/.env.example`): `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `VOICE_AGENT_SECRET`.
- **Point the agent at os.** When os is live, set the LiveKit agent secret `DEBO_URL` to the public address of the os server (its `PUBLIC_API_URL`, for example `https://api.debo.life`) and `VOICE_AGENT_SECRET` to the same value as on the server, then `cd apps/voice-agent && lk agent deploy` (or `lk agent update-secrets`). The agent's built-in default is now `https://api.debo.life`, so if the LiveKit secret `DEBO_URL` is not set it already points at os; the old web app only works if `DEBO_URL` is set to `https://debo.life`. The agent calls `{DEBO_URL}/api/voice/brain`.
- **One brain here too: the same agent as chat.** The route only needs a `VoiceBrain` (`voice/brain.ts`): an async generator of `sources`, `emotion`, `text`, `say` and `done` events. `createApp` uses `EngineVoiceBrain` (`voice/engine-brain.ts`), which runs the chat agent (`ConversationAgent`, `engine/conversation.ts`) with the channel set to voice. So she has every chat tool: journal search and saving, memories, tasks and goals, web search, browser, computer, mail, calendar and connected apps. Each call is one conversation saved by the same `DatabaseAgentRunner` chat uses, so it shows in Chat. Its thread id is `voice-<call id>` (the call id is worked out from the person and the session, see below), so deleting the call also deletes this chat copy. There is no "keep voice transcripts" switch in the Debo app: calls are always saved, and audio is never stored. See the next section. Source chips come from what the journal tools returned (`ask_my_life`, `search_my_journal`), not from the model's words. The journal's daily limit and usage rows apply when she asks the journal (`ask_my_life`); the model's own turn is not counted separately, as in chat.
- **Voice popup**: Talk is a full-screen popup over any screen (the microphone button in the chat box, or the `/talk` address; it is not a tab in the bottom bar). Debo's face is the orb. A halo follows her voice and a ring follows the microphone: on the web from an AnalyserNode on the audio tracks, on phones from LiveKit's speaker levels (coarser). Under her the state is written in words. Escape or a swipe down ends the conversation and turns the microphone off. Not yet verified with real LiveKit audio or on a phone.
- **App** (`os/apps/mobile/src/debo-talk.tsx`, `debo-voice-engine.ts`, `debo-voice-platform.{web,native}.ts`): consent text before the microphone (it says the call is saved as text, that Debo learns from what the person says, that it can be deleted, and that the recording is never kept), a status line that says in words whether the microphone is on, Start talking, Stop Debo, Turn microphone off, End conversation, live captions, source chips, a text box, screen-reader labels, reduced motion. If the microphone is refused the conversation stays open for typing.
- **Web**: `livekit-client` 2.24.0, loaded only when "Start talking" is pressed (its own 619 kB file in `expo export`).
- **iOS and Android**: use LiveKit's official route: `@livekit/react-native` 3.1.0, `@livekit/react-native-webrtc` 150.1.1, and the Expo plugins `@livekit/react-native-expo-plugin` and `@config-plugins/react-native-webrtc` (13.x is the line for Expo 54). WebRTC is native code, so voice needs a development build or store build, not Expo Go. In Expo Go the screen says "Voice needs the Debo app build" and typing still works. To build: `cd os/apps/mobile`, `npx expo prebuild --clean` (or `npx expo run:ios` / `npx expo run:android`, or an EAS build), then start with `npx expo start --dev-client`. GitHub Actions does this for releases (`.github/workflows/release-mobile.yml`: `expo prebuild` and Gradle for an Android APK; see `os/apps/mobile/README.md`). The plugins in `app.json` add the microphone permission text, the Android audio permissions and the LiveKit pod source. The WebRTC plugin also adds a camera permission string; Debo never opens the camera.
- **Checked**: `tsc`, `expo export` for web, iOS and Android, `expo prebuild` for iOS and Android (permissions and Podfile sources present), and 10 node tests for both routes. **Not checked**: a real LiveKit room from os, a native device or simulator, real speech.

## Voice calls are saved and learned from (os)

**Rule change (14 November 2026, the owner's decision).** Rule 2 used to say "ask before saving a conversation, let the person choose". In the Debo app it is now "always": every call is saved as text and Debo learns from it, with no off switch. The person stays in control another way: the Talk screen says it in plain words before the microphone starts, and every call can be read, exported and deleted. Audio is still never stored. The old web app's "Keep voice transcripts" setting does not apply to the Debo app.

- **One source per call.** A call is a row in `sources` with kind `voice_call` (no migration for the kind). Its text is one line per turn, `[mm:ss] You: ...` and `[mm:ss] Debo: ...`, in order; `mm:ss` is how far into the call the line was said. Both sides, and typed turns inside a call, are included. The call id is a hash of the person and the session (`callSourceId`, `packages/db/src/voice-call.ts`), so every turn of one call lands in the same row, and one person can never touch another's row.
- **Saving a turn costs nothing.** `POST /api/voice/brain` appends the person's line when the question arrives and Debo's line when she is done (including a reply the person talked over). It is one database write, `appendCallTurn`, with no AI. A failed write never breaks the call.
- **Reading a call happens once.** Reading means: cut the text into search pieces (whole turns, about 1,200 characters), embed them for meaning search, and send the person's words to Mem0. It runs (1) when the app says the call ended, `POST /api/voice/ended` (needs a signed-in owner; the server waits two seconds for Debo's last line, then reads all of that person's open calls, because the voice agent's session id is not known to the app), and (2) as a fallback for any call that has been quiet for ten minutes (`CALL_IDLE_MS`), the next time that person asks a voice question or lists or saves journal entries, and on the existing five minute background sweep of the server. A closed tab therefore never loses a call.
- **Safe to repeat.** The new nullable column `sources.ingested_at` records when a call was last read. A call is due when it was never read, or got a turn after that. Reading replaces the call's search pieces and forgets then re-adds its memories (memories the person fixed stay), so nothing is doubled. Two reads at once for one call are collapsed in the server.
- **Only the person's words become memories.** The call goes to Mem0 as messages: the person's turns as `user`, Debo's turns as `assistant` for context only, with instructions (`packages/memory/src/conversation.ts`) never to save what Debo said, asked or guessed, and not to treat role-play as fact. This relies on Mem0 obeying the instruction for the assistant role; it is tested that Debo's lines are never sent as the person's, not what Mem0 returns.
- **Very short calls are deleted.** If the person said fewer than three words in total, reading deletes the call instead of keeping it.
- **See, fix, export, delete.** Calls show in the Journal list as "Voice call, 14 November" with their length, and can be read whole. Source chips say "Voice call, 14 November" and open the call. They cannot be edited (a record of what was said); what Debo learned can be fixed or forgotten in What Debo knows. "Delete call" deletes the call, its search pieces, the memories that came only from it, and the chat copy in Chat. Deleting a chat copy by hand (if a way to do it is added) would leave the call in the journal. "Download my data" and "Delete my data" include calls; account deletion removes them by cascade.
- **Not verified in production.** Everything here is tested with an in-memory database and a fake memory. The SQL (`appendCallTurn`, `prepareCallIngest`) and Mem0's handling of the assistant role have not run against Neon or Mem0.

## Who Debo is when she speaks (os)

- **Character.** One character for chat and voice, in `os/apps/server/src/engine/personality.ts`: a warm, personal, friendly assistant who reacts to the person's feeling first, mirrors English, Hindi or Hinglish, and can do things, not only read the journal. Voice adds spoken style (`voiceStyle`): short sentences, contractions, small interjections, no lists or markdown, no ids or URLs read out. She is honest that she is an AI if sincerely asked.
- **Role-play.** If the person says "act as my girlfriend" (or a friend, a coach), the agent calls `set_persona`. The role is saved per person (record kind `persona`, `os/apps/server/src/persona.ts`) and added to the instructions of every later chat and call until the person says stop (`clear_persona`) or presses "Stop this role" in the "A role for Debo" card on the Apps screen (`GET/PUT/DELETE /api/persona`). It is exported and deleted with the account. The instructions keep three limits over any role: no sexually explicit content; drop the role and be caring and direct if the person seems to be a minor or in crisis; do not claim to be a real human if sincerely asked. The role text is treated as a description, never as new rules.
- **Feeling in the voice.** Each spoken reply starts with a hidden tag such as `[[feel:happy]]`. The brain (`voice/emotion.ts`) removes it so it is never spoken and sends an `emotion` event. The agent checks it against a fixed list of Cartesia Sonic-3 emotions and calls `tts.updateOptions({ modelOptions: { emotion } })` before that reply is spoken (it reads the first events of the reply first so the feeling is set in time). Allowed: neutral, calm, content, happy, excited, enthusiastic, curious, affectionate, sympathetic, sad, apologetic, surprised, grateful, wistful. `VOICE_EMOTION=off` on the agent turns this off. Laughter: Cartesia documents a `[laughter]` tag, but LiveKit's page says laughs are not supported through its plugin, so Debo does not use it. She says "haha" in words instead.
- **Voice.** Cartesia Sonic-3, voice `9626c31c-bec5-4cca-baa8-f8ba9e84c8bc` ("Jacqueline", young adult woman, LiveKit's listed voice), language `hi` (reads English too). Change with `VOICE_TTS_VOICE`, `VOICE_TTS_LANGUAGE`, `VOICE_TTS_SPEED` (0.6 to 1.5). Cartesia names Maya, Tessa, Dana and Marian as the voices with the best emotional range, but their ids are not in LiveKit's list, so none was chosen without hearing it. Listen and pick.
- **Turn taking** (`apps/voice-agent/src/main.ts`): LiveKit's turn detector, a 350 ms minimum pause (default 500), 2.5 s maximum, a cough or "mm-hm" resumes after 1.5 s. Preemptive generation is off on purpose: the brain runs tools, and an early guess would run them twice.

## Debo's voice

- One voice, chosen once, used everywhere. Warm, young, clear. Not a child's voice, not a cartoon, and not a copy of any real person or character.
- Speaks in short sentences. Spoken answers are shorter than written ones.
- Says sources out loud briefly ("from your journal on the fourteenth of March") and shows the chips on screen.
- Says "I don't have anything about that yet" when it does not know.
- Is honest that she is an AI when sincerely asked, even while playing a role the person asked for.

## Rules

1. **The mic is off unless the person turned it on.** A clear indicator shows when Debo is listening.
2. **Say plainly that a call is saved.** Changed on 14 November 2026: in the Debo app every call is always kept as a text source and Debo learns from it, with no off switch; the Talk screen says so before the microphone starts, and the person can read, export and delete every call. Audio is never kept. (Before this, the rule was to ask first and let the person choose.)
3. **Never record other people in secret.** If the person uploads a recording with others in it, that is their choice; Debo does not start recording on its own.
4. **Voice cannot do risky things.** Forgetting memories, connecting apps, changing plans and deleting the account need a tap on screen. In the Debo app this is enforced by the tools themselves: anything that sends, posts, pays, changes or deletes (and saving a journal entry) only prepares a review. When a call prepared one, the brain always says "I've put that on your screen to approve". A spoken yes never counts.
5. **Count the minutes.** Voice costs much more than text. Record seconds in `usage` and show the person what they have left.

## Still to do

- Test with real speech on the live site, including mixed Hindi and English, and write the results here.
- Choose Debo's own voice (the current one is a stock Cartesia voice) with a few real listeners.
- Hear the new voice and feelings with real speech (nothing of this was tried with a live call), and test laughter if Cartesia adds it to LiveKit.
- Count voice minutes in `usage` (rule 5). LiveKit's dashboard shows them today; Debo's daily limit counts only the answer tokens.
- Use the conversation history in `askStream` for follow-ups (the web app; in the Debo app the whole call is the agent's history).

## Quality bar

- Debo starts answering within about one second of the person finishing.
- Interrupting stops Debo at once.
- A dropped connection reconnects without losing the conversation.
