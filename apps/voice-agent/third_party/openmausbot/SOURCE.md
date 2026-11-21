# OpenMausBot speech code in the voice agent

Repository: https://github.com/milind-soni/OpenMausBot
Commit: da592ee7251ae853e33f6d837433fd144ca3e333
License: Apache-2.0


- **Repo:** https://github.com/milind-soni/OpenMausBot (Apache-2.0, see `LICENSE` here)
- **Commit:** `da592ee7251ae853e33f6d837433fd144ca3e333`
- **Why here and not in the root `third_party/`:** LiveKit Cloud builds `apps/voice-agent` on its own from its folder, so the copy has to live inside it.
- **Not copied:** anything from `enterprise/` or `third_party/browser`, and no Supamaus name or mascot.

## Copied: what was copied

| Here | Upstream | Changed? |
|---|---|---|
| `tts/speech-text.ts` | `server/tts/speech-text.ts` | Yes: `stripEmphasis` uses regular expressions instead of `mdast-util-from-markdown`, so no new package is needed. |
| `tts/speech-text.test.ts` | `server/tts/speech-text.test.ts` | Header only. All 45 upstream cases pass. |
| `tts/elevenlabs.ts` | `server/tts/elevenlabs.ts` | Yes: two OpenMausBot imports replaced by small local functions; speech comes back as `pcm_24000` instead of MP3; three type-only fixes. |
| `tts/openai.ts` | `server/tts/openai.ts` | Yes: Node 24's built-in `WebSocket` instead of the `ws` package. |
| `tts/gemini.ts` | `server/tts/gemini.ts` | Header and one type-only fix. |
| `tts/deepseek.ts` | `server/tts/deepseek.ts` | Header and one import path. |
| `shared/openai-voice.ts`, `shared/deepseek-voice.ts` | `shared/*.ts` | Header only. |

Every changed file starts with a "Changed by Daksha" line saying what changed.

Left out: `fish.ts` and `grok.ts` (they return MP3, which a LiveKit call cannot play without a decoder), `chatterbox.ts` and `system-voices.ts` (they need a local server or the desktop's own voices), and `index.ts` (OpenMausBot's settings).

## Changed: how Daksha uses it

- `src/speakable-stream.ts` passes every sentence of a reply through `speakable()` before the voice says it.
- `src/own-key-tts.ts` wraps the four adapters as one LiveKit voice. It is off unless `VOICE_TTS_PROVIDER` and that provider's key are set on the agent.
