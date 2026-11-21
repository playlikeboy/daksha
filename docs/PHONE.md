# Phone calls

Talk to Daksha on an ordinary phone call. The person can call Daksha's number, and Daksha can call the person's own number, for a test call or a reminder they turned on. Phone calls are off until the trunks below are set. Without them, the Phone card says "Phone calls aren't set up yet" and nothing else changes. No number has been bought.

The parts:
- The server: `os/apps/server/src/phone/` (`config.ts`, `service.ts`, `dialer.ts`, `routes.ts`).
- The voice agent: `apps/voice-agent/src/phone.ts`, `phone-gate.ts` and `main.ts`.
- The app: `os/apps/mobile/src/phone-setting.tsx`.
- The decision: 38 in `docs/DECISIONS.md`.

## How a call is kept safe

Caller ID can be faked, so a number alone never opens anyone's Daksha.

1. **Linking a number.**
   - In Settings, under Phone, the person types their number and gets a 6-digit code. The code lasts 15 minutes.
   - They call Daksha's number from that phone and say the code.
   - The number is linked only when the code is right. It allows 5 tries, and the number must not already be linked to another account.
2. **A PIN on every call.** The person sets a 4 to 8 digit PIN in the app. Every call, in or out, starts with "Say your PIN". Until it is right, the call hears only the PIN question. After 5 wrong PINs, calls are paused for 30 minutes. PINs are stored as scrypt hashes.
3. **A signed call token.** The server hands the agent an HMAC-signed token for the call, and the agent sends it back with each step (`/api/voice/phone/start`, `/code`, `/pin`, `/ended`, all behind `VOICE_AGENT_SECRET`). A call Daksha places carries the owner inside its signed token, so the agent cannot be pointed at another account.
4. **Daksha only calls the person's own verified number.**
   - It calls only when the person asks ("Call me now") or turns on reminder calls.
   - Each person is limited to 3 calls an hour and 6 a day. The whole server is limited to 60 an hour.
   - It calls only numbers starting with a country code in `PHONE_ALLOWED_COUNTRY_CODES` (default `+1`).
5. **Risky actions still need a tap.** Calls follow the voice rules: anything that sends, pays, changes or deletes waits for a tap on screen (decision 28).
6. **Transcripts.** A call is saved as text like any other call (decision 27): a chat copy and a journal source the person can delete. Audio is never stored.

## Setup

You need a LiveKit Cloud project (already used for voice) and a phone number on a SIP trunk. LiveKit can sell a US number itself (LiveKit Phone Numbers). Otherwise use a SIP provider such as Twilio Elastic SIP Trunking or Telnyx.

1. **Number.** Buy or port a number on your SIP provider, or in LiveKit's Telephony page.
2. **Inbound trunk** (people call Daksha):
   ```
   lk sip inbound create --name daksha-in --numbers +1XXXXXXXXXX
   ```
   Set `LIVEKIT_SIP_TRUNK_ID` on the os API to the trunk id it prints (`ST_...`). If you use your own provider, point its origination at your LiveKit SIP address, shown in the LiveKit project settings.
3. **Dispatch rule** (each inbound call gets its own room, and Daksha's agent joins it):
   ```json
   {
     "name": "daksha-phone-in",
     "trunk_ids": ["ST_..."],
     "rule": { "dispatchRuleIndividual": { "roomPrefix": "debo-phone-in-" } },
     "room_config": { "agents": [{ "agentName": "debo-voice" }] }
   }
   ```
   Create it with `lk sip dispatch create rule.json`. The agent name must stay `debo-voice` (`VOICE_AGENT_NAME`).
4. **Outbound trunk** (Daksha calls the person):
   ```
   lk sip outbound create --name daksha-out --address <provider SIP address> --numbers +1XXXXXXXXXX --auth-user ... --auth-pass ...
   ```
   Set `LIVEKIT_SIP_OUTBOUND_TRUNK_ID` to its id. The server makes a room named `debo-phone-<uuid>`, dispatches the agent into it with the signed token, then calls `SipClient.createSipParticipant` with the person's verified number.
5. **The rest of the env:**
   - `LIVEKIT_SIP_PHONE_NUMBER`: Daksha's number, shown in the app so people know what to call.
   - `PHONE_ALLOWED_COUNTRY_CODES`: for example `+1,+44`.
   - The voice keys `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` and `VOICE_AGENT_SECRET` must already be set.
6. Redeploy the voice agent (`lk agent deploy`). It already handles SIP callers. It needs no new secret.

You can set just the inbound trunk (call-in only) or just the outbound trunk. Linking a number needs the inbound trunk, because linking is done by calling in.

## Costs

These figures are rough and **not confirmed**. Check the provider's price page before buying.
- A US number is about **$1 a month**.
- Calls cost about **1 cent a minute** for the carrier, plus LiveKit's SIP minutes, plus the usual voice costs (speech-to-text, the model, and the voice) for every minute of talk.
- A test call or reminder call of one minute costs a few cents in all.
- The rate limits above put a cap on what one person can run up.

## India

- Calling Indian numbers through a foreign SIP trunk is often blocked or unreliable. Indian rules limit internet calls that end on the public phone network to licensed Indian operators. An Indian number, or a provider with an Indian licence (for example Exotel, Plivo India or Tata Tele), is usually needed for calls to and from +91.
- This needs a check with the chosen provider before `+91` goes in `PHONE_ALLOWED_COUNTRY_CODES`. Until then it stays off.

## Consent rules (TCPA and TRAI)

This is not legal advice. Have it checked before turning outbound calls on for real users.

- **US (TCPA).** Calls that use an artificial or AI voice to a mobile number need the called person's prior express consent. Marketing calls need written consent. Daksha's calls go only to the person's own number, which they linked themselves, and only when they ask for one or turn reminder calls on. That toggle is the consent, and it can be turned off at any time in the same place. Daksha never calls for marketing. Quiet hours apply to reminder calls, as they do to reminders. Every call says it is Daksha at the start.
- **India (TRAI, TCCCPR 2018).** Commercial calls must respect the do-not-disturb registry and use registered headers or series. Service calls a person asked for, made to their own number, are a different class from promotional calls, but the provider will still ask how calls are classed. Keep outbound calls to +91 off until the provider confirms the setup.
- **Recording.** Calls are turned into text, not recorded as audio, and the privacy page says so. The opening line says it is Daksha but does not yet say the call is written down. Add that before outbound calls go live where two-party consent rules apply.

## Not checked yet

- No real call was made. LiveKit SIP, the trunks and the dispatch rule were never run. Tests use a fake dialer and a fake agent server.
- The PIN and code are heard through the normal speech-to-text. Keypad tones (DTMF) are not read yet, and noisy lines may need more tries.
- The `lk` command flags above follow LiveKit's documentation as we understood it. They were not run.
