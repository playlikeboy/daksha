# voice-agent

Daksha's voice, a LiveKit Agents worker (Node) that runs on LiveKit Cloud. See [`docs/VOICE.md`](../../docs/VOICE.md) and decision 25 in [`docs/DECISIONS.md`](../../docs/DECISIONS.md).

It hears the person (Deepgram Nova-3, English and Hindi), sends the question to Daksha's one brain at `https://daksha.life/api/voice/brain`, and speaks the answer (Cartesia Sonic-3, through LiveKit Inference; or a custom person's copied voice, see below). It never answers on its own.

This folder is outside the pnpm workspace on purpose: LiveKit Cloud builds it alone from `Dockerfile` and `pnpm-lock.yaml`. Install and check it here with `pnpm install --ignore-workspace`, `pnpm typecheck` and `pnpm test`.

Deploy: `lk agent deploy` (first time: `lk agent create --region ap-south --secrets-file <file>`). Secrets the agent needs: `VOICE_AGENT_SECRET` (same value as the Worker secret) and the API address as `DAKSHA_URL` (or `DEBO_URL`, its old name; default `https://api.daksha.life`). Optional: `VOICE_TTS_VOICE`, `VOICE_TTS_LANGUAGE`.

Copied voices of custom people: at the start of each call the agent asks Daksha's server (`POST /api/voice/session`, with `VOICE_AGENT_SECRET`) whether Daksha is talking as a custom person with a voice copy. If so, the server sends the private Cartesia voice id and the key for it, and the agent speaks through `@livekit/agents-plugin-cartesia` (Apache-2.0) instead of LiveKit Inference, starting with a line that says it is Daksha's AI version of that person. The agent needs no new secret for this: the key is the person's own Cartesia key, or the optional server secret `CARTESIA_API_KEY` on the os API (not on the agent). See `src/voice-copy.ts` and "Voice notes, call recordings and voice copies" in [`docs/VOICE.md`](../../docs/VOICE.md).

Started from [livekit-examples/agent-starter-node](https://github.com/livekit-examples/agent-starter-node) (MIT, see `LICENSE`).
