# Renaming Debo to Daksha

Debo is now called **Daksha**, and its home is **daksha.life**. This file lists every place the old name appeared, what was renamed, what was kept on purpose and why, the steps only the owner can do, and how to rename any Debo text that reaches `main` later.

The rename was done on the `daksha-rename` branch, made from `main` at commit `2d6285d`.

## What the old name looked like before the rename

Counted with `git grep` on tracked text files at `2d6285d` (`git grep -Iil debo | wc -l` and friends):

| Pattern | Lines | Files | What it is |
|---|---|---|---|
| any `debo`, any case | 3388 | 473 | everything below together |
| `Debo` as a whole word | 1626 | 344 | the brand name in screens, prompts, emails, docs and comments |
| `debo.life` | 189 | 69 | web addresses: `debo.life`, `www.`, `my.`, `api.`, `about.`, `pitch.`, `mail.` |
| `@debo/` | 245 | 90 | workspace package names (`@debo/db`, `@debo/llm`, ...) |
| `DEBO_` | 104 | 30 | environment variable and secret names |
| file names with `debo` | 113 files | | `debo-*.tsx` modules, `debo.svg`, `debo-launch.mp4`, `os/apps/server/src/debo/` |
| binary files | 1 | | `apps/pitch/public/debo-pitch-deck.pdf` |

By area (files with any `debo` / lines / whole-word `Debo` / `debo.life`):

| Area | Files | Lines | `Debo` | `debo.life` |
|---|---|---|---|---|
| `apps/web` (old web app, privacy page, sign-in emails) | 60 | 423 | 311 | 27 |
| `apps/site` (landing page) | 20 | 67 | 21 | 14 |
| `apps/pitch` (investor pitch) | 22 | 110 | 84 | 19 |
| `apps/voice-agent` | 9 | 62 | 35 | 5 |
| `apps/mcp-server` | 3 | 3 | 2 | 0 |
| `packages/*` | 39 | 143 | 54 | 0 |
| `os/apps/mobile` (the app at my.debo.life and the phone app) | 124 | 900 | 325 | 12 |
| `os/apps/server` (the API) | 79 | 472 | 252 | 2 |
| `os/packages` | 6 | 12 | 9 | 0 |
| `os/infra` (Cloudflare config) | 9 | 84 | 13 | 11 |
| `os/tests` | 32 | 322 | 41 | 13 |
| `os/docs` | 8 | 93 | 64 | 9 |
| `video` (launch film sources) | 14 | 70 | 38 | 5 |
| `scripts` | 3 | 5 | 2 | 0 |
| `docs` | 20 | 402 | 295 | 26 |
| `.github` (workflows, release notes) | 7 | 61 | 10 | 19 |
| top level (`README.md`, `AGENTS.md`, `DESIGN.md`, `SECURITY.md`, `CONTRIBUTING.md`, `THIRD_PARTY_NOTICES.md`, `.env.example`, `package.json`) | 9 | | | |

To list every file again: `git grep -Iil debo`. To count by pattern: `git grep -Ic '\bDebo\b' | awk -F: '{s+=$NF} END {print s}'`.

## Renamed now

| What | Where | Change |
|---|---|---|
| The brand word in everything a person reads | screens and labels in `os/apps/mobile`, `apps/web`, `apps/site`, `apps/pitch`; sign-in emails (`apps/web/src/lib/auth-emails.ts`); push notification text; error messages from the API; PDF and export labels | `Debo` becomes `Daksha`, `DEBO` (in prompt headings) becomes `DAKSHA` |
| The assistant's own name in its prompts | `os/apps/server/src/engine/personality.ts`, `model.ts`, voice agent prompts | It now says "You are Daksha". |
| The phone app's display name | `os/apps/mobile/app.json` (`name`, `web.name`, permission texts) | `Daksha`. Expo makes the iOS project `Daksha.xcworkspace` from it, so `release-mobile.yml` builds `Daksha.app`. |
| The landing page brand | `apps/site/src/brand.ts` | `BRAND = "Daksha"`, `SITE_URL = "https://about.daksha.life"` |
| The default blue character's display name | `os/apps/mobile/src/debo-characters.ts`, `os/apps/server/src/settings-tools.ts`, the site's character list | `Daksha`. Its id stays `debo` (see below). |
| An assistant name saved as the old default | `os/apps/server/src/engine/brand.ts` | A saved name of exactly `Debo` was the old default, so it is shown and spoken as `Daksha`. Nothing in the database is rewritten. |
| Docs | `README.md`, `AGENTS.md`, `DESIGN.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/*`, `os/docs/*`, package READMEs | Brand word and addresses. The README's "being renamed" notice became a short "Debo is now Daksha" note. |
| Privacy page and legal text | `apps/web/src/app/privacy/page.tsx`, `THIRD_PARTY_NOTICES.md` | Brand word and addresses. |
| Web addresses in code and config | everywhere | `debo.life` → `daksha.life`, `www.` → `www.daksha.life`, `my.` → `my.daksha.life`, `api.` → `api.daksha.life`, `about.` → `about.daksha.life`, `pitch.` → `pitch.daksha.life`, `mail.` → `mail.daksha.life` |
| Repository links | everywhere | `github.com/playlikeboy/debo.life` → `github.com/playlikeboy/daksha` (GitHub already redirects the old one) |
| Workflow addresses | `.github/workflows/deploy*.yml`, `release-mobile.yml` | Smoke tests and the baked-in API address use the new hosts. |
| Allowed origins | `deploy-os.yml` passes `ALLOWED_ORIGINS=https://my.daksha.life,https://my.debo.life` | The new app address comes first, because the API uses the first `https://` origin for links back to the app and as the Origin it sends to Neon Auth for phone sign-in. |
| The voice agent's API address | `apps/voice-agent/src/main.ts` | Default `https://api.daksha.life`. It also reads `DAKSHA_URL` first, then `DEBO_URL`. |
| The sign-in email sender | `apps/web/src/lib/email.ts` | `signin@mail.daksha.life`, named Daksha. `DAKSHA_EMAIL_FROM` can override the address. |
| The web-push contact | `os/apps/server/src/push.ts` | Default subject `https://daksha.life`. `DAKSHA_OS_VAPID_*` are read first, then `DEBO_OS_VAPID_*`. |
| The share images | `scripts/og/og.html` and the `og.png` files it makes | The word on the image. |
| The launch film sources | `video/launch` | The words, so the next render says Daksha. The films already published still say Debo (see below). |
| The APK | `release-mobile.yml` | Each release now also carries `daksha.apk` next to `debo.apk`. |
| The data export file name | `os/apps/mobile/src/neon-gate.tsx` | `daksha-data.json` |

### about.debo.life becomes about.daksha.life, not the root

The landing page (`apps/site`, Worker `debo-site`) moves to `about.daksha.life`, not to `daksha.life` itself. Today the root `debo.life` is the `debo-web` Worker (`apps/web/wrangler.jsonc`). It still serves `/privacy` and every `/api/*` route: the Neon Auth sign-in email webhook, export and account delete. Its `proxy.ts` sends `/` to the landing page and old screens to the app. Moving the landing page to the root would mean merging two Workers or moving those routes, which is not a rename. So `daksha.life` takes the same job `debo.life` has: the root redirects to `about.daksha.life`, and `/privacy` and `/api/*` are served there.

### The old addresses keep working

Every Worker keeps its old custom domain next to the new one, so nothing that points at debo.life breaks:

| Old host | Kept on | Behaviour |
|---|---|---|
| `debo.life`, `www.debo.life` | `debo-web` | Same as `daksha.life`: privacy page, `/api/*`, redirects. The Neon Auth webhook URL keeps working. |
| `about.debo.life` | `debo-site` | Serves the same landing page. Its canonical address and sitemap say `about.daksha.life`. |
| `pitch.debo.life` | `debo-pitch` | Serves the same pitch. |
| `api.debo.life` | `debo-os-api` | Same API. Phone apps already installed have `https://api.debo.life` built in and keep working. |
| `my.debo.life` | `debo-os-app` | Sends the browser on to the same path at `my.daksha.life` (a small script at the top of `os/apps/mobile/public/index.html`). The rebuilt app talks to `api.daksha.life`; from a `debo.life` page that would be a different site, and browsers would refuse its sign-in cookie. `https://my.debo.life` stays in `ALLOWED_ORIGINS` for a tab that still runs an old copy. |

What a person notices: on my.daksha.life they sign in once more, because browser storage and push subscriptions belong to the old address. A draft entry that was never saved stays in the old address's storage. Reminders need to be turned on again on the new address to get web push there.

## Kept for compatibility (not renamed)

| What | Examples | Why it stays |
|---|---|---|
| The default character's id | `"debo"` in `CharacterId`, `characterIds`, `defaultCharacter`, `agentCharacters`, `voice-copy-data.ts`, saved `agent-settings` records | Saved settings store `character: "debo"`. Renaming the id would reset everyone who picked it. Only its display name changed. |
| Database tables, columns and record kinds | `debo_memories`, `debo_memories_entities`, record kinds, `DeboMediaDb`, `DeboCallsDb` | Renaming them needs a migration on live data. |
| Encryption contexts and device storage keys | `debo.session`, `debo.character`, `debo.journal.draft.v1`, `debo.reactions`, `debo.talk-consent`, `debo.dictation.ok.v1`, `debo:journal-draft:` | Changing a key loses what is already stored on people's devices, or makes stored secrets unreadable. |
| Secret and environment variable names | `DEBO_OS_*`, `DEBO_DATABASE_URL`, `DEBO_URL`, `DEBO_TELEMETRY`, `DEBO_SAMPLE_CONNECTORS`, `DEBO_DEV_*`, `DEBO_DEMO_*` | Changing a name silently turns a feature off where the old one is set. Optional `DAKSHA_*` aliases are read first where it matters: `DAKSHA_URL`, `DAKSHA_OS_VAPID_PUBLIC_KEY`, `DAKSHA_OS_VAPID_PRIVATE_KEY`, `DAKSHA_OS_VAPID_SUBJECT`, and the new `DAKSHA_EMAIL_FROM`. |
| Android `applicationId` and iOS bundle id | `life.debo.app` | A new id is a different app: it cannot update the one people installed, and keeps none of its data. |
| Expo `slug` and the deep-link scheme | `"slug": "debo"`, `debo://` | The slug names the Expo project; links like `debo://journal/abc` are already out there. |
| The APK file name | `debo.apk` | Old links to `releases/latest/download/debo.apk` keep working. `daksha.apk` is published too. The site still links to `debo.apk`, because only releases made after this branch merges carry `daksha.apk`. |
| R2 buckets | `debo-journal-media` | A bucket cannot be renamed; it would need a copy of every file. |
| Worker and container names | `debo-web`, `debo-site`, `debo-pitch`, `debo-os-api`, `debo-os-app`, `debo-os-browser`, `DeboApi` container class | A new name makes a new Worker, and the old one keeps its routes and secrets. |
| Workspace package names | `@debo/db`, `@debo/llm`, ... and the root package `debo` | Pure code names, never seen by a person. Renaming touches about 90 files and the lockfile. |
| File and folder names, code identifiers | `debo-*.tsx`, `os/apps/server/src/debo/`, `DeboService`, `deboApi`, CSS classes like `debo-eye` | Never seen by a person. Renaming them is churn with merge risk. |
| Wire names between the app, API and voice agent | LiveKit agent `debo-voice`, text topic `debo.sources`, RPC `debo.interrupt`, API paths `/api/debo/*`, error code `NOT_A_DEBO_ACCOUNT` | Installed phone apps and the deployed voice agent use them. Changing one side breaks the other. |
| The LiveKit project | `apps/voice-agent/livekit.toml` `subdomain = "https-debo-life-..."` | It is the name of an existing LiveKit Cloud project. |
| Published media files | `debo-launch.mp4`, `debo-demo.mp4`, their posters, `debo.svg`, `debo-banner.svg`, `debo-pitch-deck.pdf` | Their addresses are linked from the README and elsewhere. The films and the PDF have the old name drawn into them; see "Later steps". |
| Film descriptions on the landing page | `apps/site/src/components/film.tsx` | They describe the films as they are, and the films still say Debo. |
| Third-party notices | `THIRD_PARTY_NOTICES.md` | Only the brand word changed; licences are untouched. |

### Possible later steps

- Re-render the launch films (`video/launch`) and the pitch deck PDF so they say Daksha, then update `film.tsx` and remove it from the allowlist.
- Rename `@debo/*` packages to `@daksha/*` (mechanical: package.json names, imports, `pnpm-lock.yaml`, tsconfig paths).
- New Workers named `daksha-*` with the same routes, then delete the `debo-*` ones.
- Point the site's Android button at `daksha.apk` once a release has it.
- Drop the `debo.life` routes once traffic to them has stopped.

## Owner's manual steps

Do these before merging `daksha-rename` into `main`, because a push to `main` runs the deploy workflows with the new routes.

1. **Cloudflare zone and DNS.** The zone `daksha.life` is already active on the Cloudflare account, and `pitch.daksha.life` is already attached to `debo-pitch`. Mail records for `mail.daksha.life` exist. Nothing else is needed for the Worker hosts: `wrangler deploy` creates the custom domains `daksha.life`, `www.daksha.life`, `about.daksha.life`, `my.daksha.life` and `api.daksha.life` and their DNS records on the first deploy. Check that no other DNS record already uses those names, or the deploy fails.
2. **Email sending.** Check in Cloudflare Email Sending that `mail.daksha.life` is verified. Until it is, set the `debo-web` secret `DAKSHA_EMAIL_FROM=signin@mail.debo.life`, or sign-in emails fail.
3. **Neon Auth trusted domains.** Add `https://my.daksha.life`, `https://api.daksha.life` and `https://daksha.life`. Keep the `debo.life` ones. Phone sign-in sends `https://my.daksha.life` as its Origin once this deploys.
4. **Neon Auth email webhook.** It may stay on `https://debo.life/api/neon-auth/webhook`, which keeps working. To move it, change it to `https://daksha.life/api/neon-auth/webhook`.
5. **OAuth redirect addresses.** The API now builds callbacks from `https://api.daksha.life`. Add the new ones next to the old ones:
   - Google Cloud OAuth client: `https://api.daksha.life/api/google/callback`.
   - Composio: allow `https://api.daksha.life/api/connectors/callback` if your Composio project keeps an allowlist.
   - MCP servers sign in with dynamic client registration, using `https://api.daksha.life/...`. Nothing to set, but connections made through `api.debo.life` keep their old callback.
6. **LiveKit.** In the deployed voice agent's secrets, set `DAKSHA_URL=https://api.daksha.life` (or update `DEBO_URL`). Without either, the new default is already `https://api.daksha.life`.
7. **Web push.** Nothing is required: the VAPID keys stay the same and the default subject is now `https://daksha.life`. To set it yourself, use `DAKSHA_OS_VAPID_SUBJECT` (or the old `DEBO_OS_VAPID_SUBJECT`) as a GitHub secret.
8. **New optional secrets** (all optional, all fall back to the old names): `DAKSHA_URL` (voice agent), `DAKSHA_EMAIL_FROM` (`debo-web`), `DAKSHA_OS_VAPID_PUBLIC_KEY`, `DAKSHA_OS_VAPID_PRIVATE_KEY`, `DAKSHA_OS_VAPID_SUBJECT` (API).
9. **GitHub.** The repo is already `playlikeboy/daksha`. Update the repo's website field to `https://about.daksha.life` if you like.

## The brand check

`node scripts/check-brand.mjs` fails if the word `Debo` (or `DEBO` on its own), or a `debo.life` address, appears in a tracked text file, except where the allowlist below says it may. The Check workflow runs it. A line can also opt out by containing `brand-check: keep`, for the rare line that must name the old brand, like the code that maps an old saved name.

Each allowlist line is a path (or a folder ending in `/`), optionally followed by ` | ` and a regular expression. With an expression, only lines matching it are allowed in that file.

```brand-allowlist
docs/RENAME.md
scripts/check-brand.mjs
README.md | Debo is now Daksha|debo-banner|debo-launch|debo\.svg
apps/site/src/components/film.tsx | LABEL|films themselves
apps/web/wrangler.jsonc | debo\.life
apps/site/wrangler.jsonc | debo\.life
apps/pitch/wrangler.jsonc | debo\.life
os/infra/cloudflare/api/wrangler.jsonc | debo\.life
os/infra/cloudflare/app/wrangler.jsonc | debo\.life
.github/workflows/deploy-os.yml | debo\.life
os/apps/mobile/public/index.html | debo\.life
apps/voice-agent/livekit.toml | debo-life
os/tests/ | debo\.life
```

## Re-run recipe

When this branch merges, text added to `main` in the meantime may still say Debo. From the repo root:

```sh
# Files that may still say Debo, minus the allowlisted ones.
files=$(git grep -lI -e '\bDebo\b' -e '\bDEBO\b' -e 'debo\.life' -- . \
  ':!docs/RENAME.md' ':!scripts/check-brand.mjs' ':!apps/site/src/components/film.tsx' \
  ':!**/wrangler.jsonc' ':!.github/workflows/deploy-os.yml' ':!os/apps/mobile/public/index.html')

# 1. The repository link first, then every host, then the bare word.
perl -pi -e '
  s{github\.com/playlikeboy/debo\.life}{github.com/playlikeboy/daksha}g;
  s{\b((?:www|my|api|about|pitch|mail)\.)?debo\.life\b}{$1daksha.life}g;
  s{\bDebo\b}{Daksha}g;
  s{\bDEBO\b}{DAKSHA}g;
' $files

# 2. Review, then run the check.
git diff --stat
node scripts/check-brand.mjs
```

Then look at the diff by hand for these:

- `debo.apk`, `life.debo.app`, `debo://`, `@debo/`, `DEBO_*`, `"debo"` ids and storage keys are untouched by the recipe on purpose (they are not the whole word `Debo`, or not a `debo.life` host). Keep them.
- A new user-facing string that the recipe could not see, like a lowercase `debo` in text, needs a manual fix. `node scripts/check-brand.mjs` does not catch lowercase.
- Any line that must keep the old name gets `brand-check: keep` or an allowlist entry above.
