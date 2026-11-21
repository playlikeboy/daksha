> [!NOTE]
> **Debo is now Daksha.** Same app, new name, new home at https://www.daksha.life. The old debo.life addresses still work and lead to the new ones. What changed and what kept its old name for compatibility is in [`docs/RENAME.md`](./docs/RENAME.md); the addresses are in [`docs/DOMAINS.md`](./docs/DOMAINS.md).

<p align="center">
  <img src="./docs/assets/debo-banner.svg" alt="Daksha, a small red tomato, next to the words: Daksha, a friendly assistant that remembers your life." width="100%">
</p>

<p align="center"><strong>A friendly assistant that remembers your life, and always shows where it learned it.</strong></p>

<p align="center">
  <a href="https://www.daksha.life">Website</a> ·
  <a href="https://my.daksha.life">Open the app</a> ·
  <a href="https://daksha.life/privacy">Privacy</a> ·
  <a href="https://github.com/playlikeboy/daksha/releases/latest">Android app</a> ·
  <a href="./docs/ROADMAP.md">Roadmap</a>
</p>

## Watch the launch film

<p align="center">
  <a href="https://www.daksha.life/daksha-launch.mp4">
    <img src="https://www.daksha.life/daksha-launch-poster.webp" alt="Play the Daksha launch film, about a minute long" width="100%">
  </a>
</p>

<p align="center"><a href="https://www.daksha.life/daksha-launch.mp4">Play the launch film (about a minute)</a> · <a href="https://www.daksha.life/daksha-demo.mp4">the full app walkthrough</a></p>

The launch film is an animation: its cards are redrawn from the app's own screens and words, and it shows only what the app does today. The walkthrough is recorded from the app in demo mode (see `docs/MEDIA.md`). All names and entries in both are made-up sample text.

## What Daksha is

Daksha keeps the bits of your life in one place: your journal, your voice notes and videos, and later your papers and photos. You ask it about your own life in plain words, by text or by voice, like "When did Riya move to Pune?" or "What did the doctor say in March?".

Every answer links to the entry it came from. If Daksha has nothing about a question, it says so instead of guessing. You can see, fix and forget what Daksha knows, download your data, and delete it.

Daksha is early. Do not treat any feature as finished until you have checked it in the code or the app. What is built and what is only planned is in [`docs/ROADMAP.md`](./docs/ROADMAP.md) and [`os/docs/FEATURES.md`](./os/docs/FEATURES.md); where the two disagree, the code is the truth.

## Custom people (new, early version)

You can make your own people to talk to, in chat or on a call: a friend, someone in your family, someone you miss, or a character you invent. This part is new and has had little real-world testing.

- **Build them from a description, or from your own files.** Add a WhatsApp chat export, photos, videos, voice notes and call recordings. Daksha separates who is speaking in recordings (Cloudflare Workers AI, Deepgram Nova-3) and keeps only that person's words.
- **Copy their voice, if you choose.** Only with their permission, or if you are close family and they have died. Never a public figure. A copied voice is made with Cartesia and, for now, needs a Cartesia key.
- **Design their face** with the face builder, so they smile, blink and talk like the built-in characters.
- **Private and honest.** Daksha reads your files once, keeps a short profile and deletes the raw files. The people you make are private to you. It is always honest that it is an AI and never claims to be the real person. A copied voice is used only inside your own Daksha, never to call or message anyone.

You can also change settings just by asking: "talk a bit slower", "call yourself Riya" or "turn on my morning check-in". Daksha changes it at once and shows what changed. Why and how: decision 33 in [`docs/DECISIONS.md`](./docs/DECISIONS.md).

## News and briefings (new, early version)

- **News on topics you follow.** Follow topics like cricket, AI or Bengaluru weather, in settings or by saying "follow cricket". Stories come from the GDELT Project and Hacker News, with one copy of each and a mix of sites. Only the topic word is sent to them, from Daksha's server.
- **A briefing way of talking.** Pick "Briefing: crisp and calm" for short, calm answers, and say "brief me" for your day: calendar, reminders, birthdays, tasks and two stories. A morning briefing notification is there if you turn it on. Why and how: decision 37.

## Skills and steadier long chats (new, early version)

- **Skills you can turn on.** In Apps, Skills, turn on ready-made ways of working, such as a weekly review, meeting action items, inbox triage or answers with sources. They come from the Hermes Agent project by Nous Research (MIT), with credits kept, and are off until you turn them on.
- **Suggested tool servers.** The "Add a tool server" form suggests known servers to connect. Adding one still waits for your yes.
- **Steadier long chats.** Daksha reminds the model when it repeats the same step, stops a step that takes too long, and keeps very long chats and very long results small for the model, while your saved chat keeps everything. These parts are adapted from DeepSeek Harness (MIT). What came from where: decision 38.

## Where it lives

| What | Address |
|---|---|
| Landing page | https://www.daksha.life (https://daksha.life redirects people here) |
| The app (web, installable to a phone's home screen) | https://my.daksha.life |
| The API the app talks to | https://api.daksha.life |
| Investor site | https://pitch.daksha.life |
| Privacy page | https://daksha.life/privacy |
| Android app (early test build) | [GitHub Releases](https://github.com/playlikeboy/daksha/releases/latest), file `daksha.apk` (direct link: https://github.com/playlikeboy/daksha/releases/latest/download/daksha.apk). A new build is published each time the phone app changes on `main`. |

There is no iPhone app yet. On an iPhone, use https://my.daksha.life in Safari and choose Share, then Add to Home Screen.

## What is in this repo

There are two pnpm workspaces. The root one holds the landing page and the older code. `os/` is the newer app and is a workspace of its own.

```
apps/                    root workspace
  site/                  Landing page (www.daksha.life). Next.js on Cloudflare Workers, one plain stylesheet.
  pitch/                 Investor site (pitch.daksha.life). Same stack.
  web/                   The retired first app. Its screens now send people to the new app.
                         It still serves /privacy (daksha.life/privacy) and the /api routes.
  voice-agent/           LiveKit voice worker. Its own project, outside the workspace.
  mcp-server/            Planned: Daksha's memory for other AI tools. Libraries installed, no working server.
packages/                root workspace
  db/  llm/  memory/  ingest/  connectors/  recall/  brain/  tools/   Shared code (db is the only one that talks to Postgres)
  ui/                    Planned, no code yet
os/                      The new app. Its own workspace, from its own lockfile.
  apps/server/           The API (Hono): sign-in pass-through, journal, chat, voice, files
  apps/mobile/           The app: one Expo / React Native codebase for the web, Android and iOS
  apps/worker/           Browser worker (Playwright and Chromium) the agent uses
  apps/computer/         Optional Linux sandbox for the agent, off unless configured
  infra/cloudflare/      Cloudflare Worker and container setup for the API, app and browser worker
docs/                    Product, rules and decisions for the whole project
os/docs/                 Docs for the new app
```

Package rules are in [`docs/MONOREPO.md`](./docs/MONOREPO.md).

## Run and test each part

You need Node 22 or newer. The root workspace uses pnpm 10; `os/` uses pnpm 11.19.0 (`npx -y pnpm@11.19.0 ...` works).

**Landing page and investor site** (no environment variables needed):

```bash
pnpm install
pnpm --filter @debo/site dev          # http://localhost:3000
pnpm --filter @debo/site typecheck
pnpm --filter @debo/pitch dev
pnpm --filter @debo/pitch typecheck
node apps/pitch/scripts/check.mjs http://localhost:3000 out   # checks every pitch page at phone and desktop width
```

**Everything in the root workspace:**

```bash
pnpm typecheck
pnpm build
pnpm test                             # Vitest in each package that has tests
pnpm --filter @debo/recall recall     # checks search finds the right entries
```

**The retired web app** (`apps/web`) needs a Neon project and keys; see [`docs/SETUP.md`](./docs/SETUP.md). Its end-to-end test is `pnpm --filter @debo/web test:e2e`.

**The new app** (`os/`):

```bash
cd os
npx -y pnpm@11.19.0 install --frozen-lockfile
cp .env.example .env
npx -y pnpm@11.19.0 dev               # the API on http://localhost:8787
npx -y pnpm@11.19.0 dev:web           # the app on http://localhost:8081 (second terminal)
npx -y pnpm@11.19.0 test              # server and app tests
npx -y pnpm@11.19.0 typecheck
```

The local sample mode needs no model key or Neon project. The full list of settings and the browser worker are described in [`os/README.md`](./os/README.md) (that file still carries the text of the template Daksha started from, so read it with [`os/docs/AUTH.md`](./os/docs/AUTH.md) beside it).

**Voice worker:** `cd apps/voice-agent`, then `pnpm install`, `pnpm test`, `pnpm dev`. See [`docs/VOICE.md`](./docs/VOICE.md).

## Deploys

Every deploy is a GitHub Actions workflow in [`.github/workflows`](./.github/workflows). Secrets are repository secrets and Worker secrets, never in the repo.

| Workflow | Runs on | Deploys |
|---|---|---|
| `deploy.yml` | push to `main` | `apps/web` to daksha.life (also applies database migrations) |
| `deploy-site.yml` | push to `main` that touches `apps/site` | the landing page, www.daksha.life |
| `deploy-pitch.yml` | push to `main` that touches `apps/pitch` | pitch.daksha.life |
| `deploy-os.yml` | push to `main` that touches `os/` or `packages/` | the API (api.daksha.life), the browser worker and the web app (my.daksha.life) on Cloudflare |
| `release-mobile.yml` | a push to `main` that changes the phone app, or a pushed tag `v*` (builds only on a manual run or on the `mobile-release` branch) | builds the phone apps and publishes a GitHub Release |

The voice worker is deployed by hand with `lk agent deploy` from `apps/voice-agent`.

## Phone apps

The phone app is the same Expo app as my.daksha.life, built as a real native app (`expo prebuild`; it needs native code for voice and PDFs, so Expo Go does not work). It talks to https://api.daksha.life.

- **Android:** each release has `daksha.apk` (and the same file as `debo.apk`, so links from before the rename work). It is an early test build, signed with a debug key, installed by hand. It is not on Google Play and cannot be until the owner makes a proper upload key. Nobody has run it on a real phone yet.
- **iPhone:** no installable app. A release may carry an unsigned build for the iOS Simulator on a Mac, for developers only. A real iPhone build needs a paid Apple Developer account.

How to build, what the workflow does and what is needed for the stores: [`os/apps/mobile/README.md`](./os/apps/mobile/README.md). Every push to `main` that changes the phone app publishes a new build as `v<version>-build.<run number>`. For a named version, put the version in `os/apps/mobile/app.json`, merge to `main`, then push a tag such as `v0.2.0`.

## Who sees your data

From [the privacy page](https://daksha.life/privacy), which is the place to read the exact words:

- **Neon** runs the database, sign-in and file storage (United States, Amazon Web Services us-east-2). The Neon AI Gateway, with models run by Databricks, turns text into numbers for search by meaning.
- **Anthropic** writes the answers from the pieces of your entries that match your question. For a custom person, it also reads the scrubbed chat lines and the photos you add, and writes their profile.
- **Mem0** stores the memories Daksha picks out of your entries.
- **Cloudflare** runs the websites, sends sign-in emails, stores voice notes and videos in a private bucket, and writes out their words (Workers AI, Whisper). For a custom person's videos it writes out the words the same way, and for their voice notes and calls it tells the voices apart (Workers AI, Deepgram Nova-3). The raw files are deleted after reading, and the other speakers' words are thrown away.
- **LiveKit** carries a voice call; it uses Deepgram to turn speech into text and Cartesia to turn Daksha's answer into speech. The terms of those three on training and keeping audio have not been checked yet.
- **Cartesia** also keeps a copy of a custom person's voice, only if you choose to make one, until you delete it (or the person, or your account).
- **The GDELT Project** and **Hacker News search (Algolia)** get only the topic words you follow for news, from Daksha's server, never anything about you.

Daksha does not sell your data, show ads, or train AI on it. It is not end-to-end encrypted. Rules for how data is handled: [`docs/PRIVACY-AND-TRUST.md`](./docs/PRIVACY-AND-TRUST.md).

## Docs

| Doc | What it covers |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | Rules for anyone, human or AI, working here. Start here. |
| [`DESIGN.md`](./DESIGN.md), [`docs/WRITING.md`](./docs/WRITING.md) | Look and feel; plain-English rules for all text |
| [`docs/PRODUCT.md`](./docs/PRODUCT.md), [`docs/ROADMAP.md`](./docs/ROADMAP.md), [`docs/DECISIONS.md`](./docs/DECISIONS.md) | What Daksha is, what is next, why we chose what we chose |
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`docs/MONOREPO.md`](./docs/MONOREPO.md), [`docs/DATA-MODEL.md`](./docs/DATA-MODEL.md) | How the parts fit; folders; database tables |
| [`docs/MEMORY.md`](./docs/MEMORY.md), [`docs/VOICE.md`](./docs/VOICE.md), [`docs/CONNECTORS.md`](./docs/CONNECTORS.md), [`docs/BYOK-AND-PLANS.md`](./docs/BYOK-AND-PLANS.md) | Memory, voice, connecting other apps, keys and plans |
| [`docs/PRIVACY-AND-TRUST.md`](./docs/PRIVACY-AND-TRUST.md), [`docs/SETUP.md`](./docs/SETUP.md) | Promises about data; accounts, secrets and running locally |
| [`os/docs/AUTH.md`](./os/docs/AUTH.md) | How sign-in works in the new app, on web and phones |
| [`os/docs/JOURNAL-MEDIA.md`](./os/docs/JOURNAL-MEDIA.md) | Voice notes and videos in the new app |
| [`os/docs/FEATURES.md`](./os/docs/FEATURES.md), [`os/docs/VERIFICATION.md`](./os/docs/VERIFICATION.md) | What the new app does and what has been checked |
| [`os/infra/cloudflare/README.md`](./os/infra/cloudflare/README.md) | How the new app is deployed to Cloudflare, and its secrets |
| [`os/apps/mobile/README.md`](./os/apps/mobile/README.md) | The app, phone builds and releases |

## Contributing and security

Read [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`AGENTS.md`](./AGENTS.md) first. Keep changes small, write in plain English, and never claim something works until it does. Do not report security problems in public issues; see [`SECURITY.md`](./SECURITY.md).

## Licence and third-party notices

The repo is under the Apache License 2.0 ([`LICENSE`](./LICENSE), copyright Shaswat Raj; see [`NOTICE`](./NOTICE)), except the folders that carry their own licence. The code in `os/` started from CopilotKit's OpenFuse template and is under the MIT licence in [`os/LICENSE`](./os/LICENSE); its brand, name and mascot are not used. `apps/voice-agent` started from LiveKit's agent starter (MIT). Code and content copied from other open-source projects lives in [`third_party/`](./third_party/README.md), each folder with its own licence and a `SOURCE.md` naming the exact commit; CI checks this with `scripts/check-licenses.mjs`. The full list, with licence texts, is in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md).
