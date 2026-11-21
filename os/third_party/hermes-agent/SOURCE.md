# Hermes Agent code in the server

- **Repo:** https://github.com/NousResearch/hermes-agent (MIT, see `LICENSE` here)
- **Commit:** `aeb5a071069dbd85d85f2c8d44337f16df29d475`
- **Language:** upstream is Python, so nothing could be copied file for file. The pieces below were ported to TypeScript, keeping the upstream structure (one verify, one read and one send per service), its limits and its checks. The ported file says where each part came from at the top.

## What was ported

| Daksha file | Upstream | What carried over |
|---|---|---|
| `apps/server/src/channels/transports.ts` (SMS) | `plugins/platforms/sms/adapter.py` | The `X-Twilio-Signature` check (HMAC-SHA1 of the URL plus the sorted form fields), tried with and without the default port; failing closed on an empty token; the 64 KiB body cap; repeat `MessageSid`s dropped; echoes from our own number ignored; the empty TwiML reply; the SMS markdown stripping; the 1600-character limit; the `Messages.json` send with Basic auth. |
| `apps/server/src/channels/transports.ts` (WhatsApp) | `plugins/platforms/whatsapp_cloud/adapter.py` | The `hub.verify_token` handshake; the `X-Hub-Signature-256` check on the raw body before JSON is read; refusing when the app secret is unset; only `whatsapp_business_account` payloads, `messages` changes and the configured phone number id; repeat message ids dropped; always 200 once signed; the 3 MB body cap; the Graph `/messages` text payload. |
| `apps/server/src/channels/routes.ts` | the same two adapters' `_handle_webhook` | The order of checks: size, signature, then parse. |

## What is different

- Hono routes replace the aiohttp servers, and Daksha's sign-in stays off these routes; each checks its own signature.
- Senders are not allow-listed by number. A sender reaches Daksha only after linking with a code made in the person's Settings.
- Media, buttons, typing indicators, voice notes and group chats are not ported: text only, private chats only.
- Telegram is not from Hermes's 6,600-line adapter. It follows suparagent's `telegram_bot.py` (`/start`, `/link <code>`, then text; see `../suparagent/SOURCE.md`), with the Bot API's secret-token header for the webhook.
