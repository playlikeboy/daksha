# Notices: phone, messaging, triggers and suggestions (decision 39)

This file covers open-source code that the "more ways to reach Daksha" work copied or ported. Each copy lives inside the folder that is built on its own, with the upstream licence and a `SOURCE.md` beside it.

| Project | Licence | Commit | Where in Daksha | Used how |
|---|---|---|---|---|
| OpenMausBot, https://github.com/milind-soni/OpenMausBot | Apache-2.0 | `da592ee7251ae853e33f6d837433fd144ca3e333` | `apps/voice-agent/third_party/openmausbot/` | `speech-text.ts` and the ElevenLabs, OpenAI, Gemini and DeepSeek voice adapters, copied and changed (each file says how) |
| OpenMausBot | Apache-2.0 | same | `os/third_party/openmausbot/triggers/` | The app-event filter, preview, untrusted-data block and run prompt, copied and changed |
| OpenMausBot | Apache-2.0 | same | `os/third_party/openmausbot/meetings/` | The meeting bot, copied unchanged and not wired |
| Vexa, https://github.com/vexa-ai/vexa | Apache-2.0 | via OpenMausBot (Vexa `6b26f7b`) | `os/third_party/vexa/LICENSE` | Parts of the parked `meetbot.ts` adapt Vexa's Meet and Teams page handling |
| Hermes Agent, https://github.com/NousResearch/hermes-agent | MIT | `aeb5a071069dbd85d85f2c8d44337f16df29d475` | `os/third_party/hermes-agent/` (licence and notes), `os/apps/server/src/channels/transports.ts` | The Twilio SMS and WhatsApp Cloud webhook checks, reading and sending, ported to TypeScript |
| suparagent, https://github.com/Anil-matcha/suparagent | Apache-2.0 | `f2ae9d0f5cc40e9acca9133be1b7abe9cb9af4fc` | `os/third_party/suparagent/` (licence and notes), `os/apps/server/src/proposals/`, `os/apps/server/src/channels/` | Secret redaction, memory suggestions and skill drafts, and the Telegram link flow, rewritten in TypeScript |
| Orca, https://github.com/stablyai/orca | MIT (the module also carries Cantab Research's MIT licence) | `29bb3043bdc02e18fac98f5888ccdeaf931faa38` | `os/third_party/orca/expo-two-way-audio/` | On-device speech module, copied unchanged and not wired |

Nothing was taken from OpenMausBot's `enterprise/` or `third_party/browser`, and no product name or mascot from these projects is used.

OpenMausBot ships a `NOTICE` file. A copy is kept beside each OpenMausBot folder above (`os/third_party/openmausbot/NOTICE`, `apps/voice-agent/third_party/openmausbot/NOTICE`), as Apache-2.0 section 4(d) asks. suparagent has no NOTICE file.

Apache-2.0 notice: the OpenMausBot and suparagent code above is used under the Apache License, Version 2.0. A copy of the licence is in each `LICENSE` file named above. Changed files say "Changed by Daksha" at the top, with what changed.
