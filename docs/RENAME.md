# Renaming Debo to Daksha

Debo is now called **Daksha**, and its home is **daksha.life**. This file lists every place the old name appeared, what was renamed, what was kept on purpose and why, the steps only the owner can do, and how to rename any Debo text that reaches `main` later.

The rename was done on the `daksha-rename` branch, made from `main` at commit `2d6285d`, and merged with `main` at `0e8fc58` (the daksha.life twins, the film player, the UI audit, new media and the app's new look). After that merge, `node scripts/check-brand.mjs --fix` renamed the 369 lines `main` had added in the meantime, and the domain setup was changed to the owner's final wishes (decision 36, `docs/DOMAINS.md`).

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

After the rename, 42 lines in 13 files still have the word `Debo`, and 45 lines in 13 files a `debo.life` address. Most are in this file; every one is in the allowlist below or marked `brand-check: keep`.

To list every file again: `git grep -Iil debo`. To count by pattern: `git grep -Ic '\bDebo\b' | awk -F: '{s+=$NF} END {print s}'`.

## Renamed now

| What | Where | Change |
|---|---|---|
| The brand word in everything a person reads | screens and labels in `os/apps/mobile`, `apps/web`, `apps/site`, `apps/pitch`; sign-in emails (`apps/web/src/lib/auth-emails.ts`); push notification text; error messages from the API; PDF and export labels | `Debo` becomes `Daksha`, `DEBO` (in prompt headings) becomes `DAKSHA` |
| The assistant's own name in its prompts | `os/apps/server/src/engine/personality.ts`, `model.ts`, voice agent prompts | It now says "You are Daksha". |
| The phone app's display name | `os/apps/mobile/app.json` (`name`, `web.name`, permission texts) | `Daksha`. Expo makes the iOS project `Daksha.xcworkspace` from it, so `release-mobile.yml` builds `Daksha.app`. |
| The landing page brand | `apps/site/src/brand.ts` | `BRAND = "Daksha"`, `SITE_URL = "https://www.daksha.life"` (canonical link, sitemap, Open Graph and JSON-LD all follow it) |
| The default blue character's display name | `os/apps/mobile/src/debo-characters.ts`, `os/apps/server/src/settings-tools.ts`, the site's character list | `Daksha`. Its id stays `debo` (see below). |
| An assistant name saved as the old default | `os/apps/server/src/engine/brand.ts` | A saved name of exactly `Debo` was the old default, so it is shown and spoken as `Daksha`. Nothing in the database is rewritten. |
| Docs | `README.md`, `AGENTS.md`, `DESIGN.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/*`, `os/docs/*`, package READMEs | Brand word and addresses. The README's "being renamed" notice became a short "Debo is now Daksha" note. |
| Privacy page and legal text | `apps/web/src/app/privacy/page.tsx`, `THIRD_PARTY_NOTICES.md` | Brand word and addresses. |
| Web addresses in code and config | everywhere | `debo.life` → `daksha.life`, `www.` → `www.daksha.life`, `my.` → `my.daksha.life`, `api.` → `api.daksha.life`, `about.` → `www.daksha.life` (the landing page), `pitch.` → `pitch.daksha.life`, `mail.` → `mail.daksha.life` |
| Repository links | everywhere | `github.com/playlikeboy/debo.life` → `github.com/playlikeboy/daksha` (GitHub already redirects the old one) |
| Workflow addresses | `.github/workflows/deploy*.yml`, `release-mobile.yml` | Smoke tests and the baked-in API address use the new hosts. |
| Allowed origins | `deploy-os.yml` passes `ALLOWED_ORIGINS=https://my.daksha.life,https://my.debo.life` | The new app address comes first, because the API uses the first `https://` origin for links back to the app and as the Origin it sends to Neon Auth for phone sign-in. |
| The voice agent's API address | `apps/voice-agent/src/main.ts` | Default `https://api.daksha.life`. It also reads `DAKSHA_URL` first, then `DEBO_URL`. |
| The sign-in email sender | `apps/web/src/lib/email.ts` | `signin@mail.daksha.life`, named Daksha. `DAKSHA_EMAIL_FROM` can override the address. |
| The web-push contact | `os/apps/server/src/push.ts` | Default subject `https://daksha.life`. `DAKSHA_OS_VAPID_*` are read first, then `DEBO_OS_VAPID_*`. |
| The share images | `scripts/og/og.html` and the four `og.png` files it makes | Rebuilt with `node scripts/og/build-og.mjs`: the name on them, and the screenshot inside them, say Daksha. Asked for as `og.png?v=4`. |
| The launch film sources | `video/launch` | The words. The launch film's end card now shows www.daksha.life. |
| The films, the screenshots and the deck PDF | `apps/site/public/daksha-launch.*`, `daksha-launch-vertical.mp4`, `daksha-demo.*`, the `shots/` of the site and pitch, the app's install `screenshots/`, `apps/pitch/public/daksha-pitch-deck.pdf` | Made again from the renamed app (demo mode, made-up content) and the renamed film sources (`docs/MEDIA.md`). The old `debo-*` film and PDF addresses answer with a 307 to the new files (`apps/site/src/host-redirect.ts`, `apps/pitch/src/host-redirect.ts`). |
| The APK | `release-mobile.yml`, `apps/site/src/links.ts`, README | Each release publishes `daksha-<version>.apk` and `daksha.apk`, and the site, README and download links point at `.../releases/latest/download/daksha.apk`. A copy named `debo.apk` is still uploaded, so old links keep working. The iOS Simulator zip is `daksha-<version>-ios-simulator.zip`. |
| Download file names | `os/apps/server/src/account.ts`, `os/apps/mobile/src/neon-gate.tsx`, `apps/web/src/app/api/export/route.ts` | `daksha-data.json` and `daksha-export-<date>.zip` |
| The mascot component in the old web app | `apps/web/src/components/debo.tsx` | The React component is now called `Daksha` (the file keeps its name). |

### Where everything lives now

The full host table, with what each host serves or where it sends people, is in `docs/DOMAINS.md`. In short:

- The landing page is **https://www.daksha.life**. `www.daksha.life` moved from the `debo-web` Worker to `debo-site` (a custom domain can only be on one Worker).
- `daksha.life` (`debo-web`) still serves `/privacy` and every `/api/*` route. `/` and other pages answer 307 to the same path on `www.daksha.life`; the old `/home/*` and `/auth/*` screens go to the app.
- The app is `my.daksha.life`, the API `api.daksha.life`, the pitch `pitch.daksha.life`.

### The old addresses keep working

Every Worker keeps its old custom domain next to the new one. Redirects are 307 and keep the path and query.

| Old host | Kept on | Behaviour |
|---|---|---|
| `debo.life`, `www.debo.life` | `debo-web` | `/api/*` is served, so the Neon Auth webhook URL keeps working. Every other path: 307 to where it ends up on daksha.life, in one hop. |
| `about.debo.life` (and `about.daksha.life`) | `debo-site` | Pages: 307 to `https://www.daksha.life`. Files (films, pictures) are still served. |
| `pitch.debo.life` | `debo-pitch` | Pages: 307 to `https://pitch.daksha.life`. Files are still served. |
| `api.debo.life` | `debo-os-api` | **Served, never redirected.** Phone apps installed before the rename have it built in, and `PUBLIC_API_URL` stays on it so the Google, Composio and tool server callbacks keep working. |
| `my.debo.life` | `debo-os-app` | Every request, pages and files: 307 to the same path on `my.daksha.life`, sent by the Worker (`os/infra/cloudflare/app/src/redirect.ts`), with the old script in `index.html` as a second guard. `https://my.debo.life` stays in `ALLOWED_ORIGINS` for a tab that still runs an old copy. |

What a person notices: on my.daksha.life they sign in once more, because browser storage and push subscriptions belong to the old address. A draft entry that was never saved stays in the old address's storage. Reminders need to be turned on again on the new address to get web push there.

## Kept for compatibility (not renamed)

| What | Examples | Why it stays |
|---|---|---|
| The default character's id | `"debo"` in `CharacterId`, `characterIds`, `defaultCharacter`, `agentCharacters`, `voice-copy-data.ts`, saved `agent-settings` records | Saved settings store `character: "debo"`. Renaming the id would reset everyone who picked it. Only its display name changed. |
| Database tables, columns and stored values | `debo_memories`, `debo_memories_entities`, record kinds, the speaker and actor value `"debo"` in calls and the activity record, `DeboMediaDb`, `DeboCallsDb` | Renaming them needs a migration on live data. |
| Hash and id inputs | `debo-call:<user>:<session>` in `packages/db/src/voice-call.ts` | It makes each call's stable source id. A new prefix would give the same call a new id and duplicate it. No encryption context in the code contains the old name. |
| Device storage keys | `debo.session`, `debo.character`, `debo.journal.draft.v1`, `debo.reactions`, `debo.talk-consent`, `debo.dictation.ok.v1`, `debo:journal-draft:` | Changing a key loses what is already stored on people's devices. |
| Secret and environment variable names | `DEBO_OS_*`, `DEBO_DATABASE_URL`, `DEBO_URL`, `DEBO_TELEMETRY`, `DEBO_SAMPLE_CONNECTORS`, `DEBO_DEV_*`, `DEBO_DEMO_*` | Changing a name silently turns a feature off where the old one is set. Optional `DAKSHA_*` aliases are read first where it matters: `DAKSHA_URL`, `DAKSHA_OS_VAPID_PUBLIC_KEY`, `DAKSHA_OS_VAPID_PRIVATE_KEY`, `DAKSHA_OS_VAPID_SUBJECT`, and the new `DAKSHA_EMAIL_FROM`. |
| Android `applicationId` and iOS bundle id | `life.debo.app` | A new id is a different app: it cannot update the one people installed, and keeps none of its data. |
| Expo `slug` and the deep-link scheme | `"slug": "debo"`, `debo://` | The slug names the Expo project; links like `debo://journal/abc` are already out there. |
| The old APK file name | `debo.apk` | Each release still uploads a copy under this name, so old links to `releases/latest/download/debo.apk` keep working. The main file is `daksha.apk`. |
| R2 buckets | `debo-journal-media` | A bucket cannot be renamed; it would need a copy of every file. |
| Worker and container names | `debo-web`, `debo-site`, `debo-pitch`, `debo-os-api`, `debo-os-app`, `debo-os-browser`, `DeboApi` container class | A new name makes a new Worker, and the old one keeps its routes and secrets. |
| Workspace package names | `@debo/db`, `@debo/llm`, ... and the root package `debo` | Pure code names, never seen by a person. Renaming touches about 90 files and the lockfile. |
| File and folder names, code identifiers | `debo-*.tsx`, `os/apps/server/src/debo/`, `DeboService`, `deboApi`, CSS classes like `debo-eye` | Never seen by a person. Renaming them is churn with merge risk. |
| Wire names between the app, API and voice agent | LiveKit agent `debo-voice`, text topic `debo.sources`, RPC `debo.interrupt`, API paths `/api/debo/*`, error code `NOT_A_DEBO_ACCOUNT` | Installed phone apps and the deployed voice agent use them. Changing one side breaks the other. |
| The LiveKit project | `apps/voice-agent/livekit.toml` `subdomain = "https-debo-life-..."` | It is the name of an existing LiveKit Cloud project. |
| Logo file names | `debo.svg`, `debo-banner.svg` | Their addresses are linked from the README and elsewhere. They draw the tomato, not the name. |

### Possible later steps

- Retake the pitch's `shots/chat-light.webp` (a real answer with a source chip, in the app's old look; it does not show the name) when a demo with a model is safe to run (`docs/MEDIA.md`).
- Rename `@debo/*` packages to `@daksha/*` (mechanical: package.json names, imports, `pnpm-lock.yaml`, tsconfig paths).
- New Workers named `daksha-*` with the same routes, then delete the `debo-*` ones.
- Move `PUBLIC_API_URL` to `api.daksha.life` once the new callbacks are registered (see `docs/DOMAINS.md`).
- Drop the `debo.life` routes once traffic to them has stopped. Keep `api.debo.life` as long as old phone apps are in use.

## Owner's manual steps

Nothing here blocks the deploy. The domain steps are in `docs/DOMAINS.md` under "The owner's steps"; this list adds the rest.

1. **Cloudflare.** The zone `daksha.life` is active, and the deploys create or move the custom domains (`www.daksha.life` moves from `debo-web` to `debo-site` on its own). The deploy token needs Workers and DNS edit on `daksha.life`.
2. **Neon Auth trusted domains.** Nothing to do: they already include `daksha.life`, `www`, `my`, `about` and `api.daksha.life`. Keep the `debo.life` ones.
3. **OAuth callbacks.** Nothing to do now: `PUBLIC_API_URL` stays `https://api.debo.life`, so the Google, Composio and tool server callbacks are unchanged. To move them later, see `docs/DOMAINS.md`.
4. **Email sending.** Check in Cloudflare Email Sending that `mail.daksha.life` is verified. Until it is, set the `debo-web` secret `DAKSHA_EMAIL_FROM=signin@mail.debo.life`, or sign-in emails fail.
5. **Neon Auth email webhook.** It may stay on `https://debo.life/api/neon-auth/webhook`, which keeps working because `/api/*` never redirects. To move it, change it to `https://daksha.life/api/neon-auth/webhook`.
6. **Android download link.** The newest release before this merge has only `debo.apk`; the site now links to `daksha.apk`. The phone build after the merge publishes it. To close the gap sooner, upload the current `debo.apk` to the latest release as `daksha.apk`.
7. **LiveKit.** In the deployed voice agent's secrets, set `DAKSHA_URL=https://api.daksha.life` (or update `DEBO_URL`). Without either, the new default is already `https://api.daksha.life`.
8. **Web push.** Nothing is required: the VAPID keys stay the same and the default subject is now `https://daksha.life`. To set it yourself, use `DAKSHA_OS_VAPID_SUBJECT` (or the old `DEBO_OS_VAPID_SUBJECT`) as a GitHub secret.
9. **New optional secrets** (all optional, all fall back to the old names): `DAKSHA_URL` (voice agent), `DAKSHA_EMAIL_FROM` (`debo-web`), `DAKSHA_OS_VAPID_PUBLIC_KEY`, `DAKSHA_OS_VAPID_PRIVATE_KEY`, `DAKSHA_OS_VAPID_SUBJECT` (API).
10. **GitHub.** The repo is already `playlikeboy/daksha`. Set the repo's website field to `https://www.daksha.life` if you like.

## The brand check

`node scripts/check-brand.mjs` (or `pnpm check:brand`) fails if the word `Debo` (or `DEBO` on its own), or a `debo.life` address, appears in a tracked text file, except where the allowlist below says it may. The Check workflow runs it as its own `brand` job, which needs no install. A line can also opt out by containing `brand-check: keep`, for the rare line that must name the old brand, like the code that maps an old saved name.

Each allowlist line is a path (or a folder ending in `/`), optionally followed by ` | ` and a regular expression. With an expression, only lines matching it are allowed in that file.

```brand-allowlist
docs/RENAME.md
scripts/check-brand.mjs
README.md | Debo is now Daksha
docs/DECISIONS.md | Debo is renamed Daksha|debo\.life
docs/DOMAINS.md | debo\.life
apps/site/src/brand.ts | it was Debo until the rename
apps/web/src/app/privacy/page.tsx | Daksha used to be called Debo
apps/web/src/lib/host-redirect.ts | debo\.life
apps/web/src/lib/host-redirect.test.ts | debo\.life|DEBO\.LIFE
apps/web/src/proxy.ts | debo\.life
apps/site/src/host-redirect.ts | debo\.life
apps/site/src/host-redirect.test.ts | debo\.life|Debo\.Life
apps/site/src/proxy.ts | debo\.life
apps/pitch/src/host-redirect.ts | debo\.life
apps/pitch/src/host-redirect.test.ts | debo\.life|DEBO\.LIFE
apps/pitch/src/proxy.ts | debo\.life
os/infra/cloudflare/app/src/ | debo\.life
os/tests/app-redirect.test.ts | debo\.life|DEBO\.LIFE
os/apps/mobile/src/api-address.ts | debo\.life
os/apps/mobile/test/api-address.test.ts | debo\.life
os/apps/server/src/public-address.ts | debo\.life
os/tests/public-address.test.ts | debo\.life
os/apps/mobile/test/api-health.test.ts | debo\.life
os/tests/connectors.test.ts | debo\.life
os/docs/CONNECTORS.md | debo\.life
.github/workflows/release-mobile.yml | debo\.life
os/infra/cloudflare/README.md | debo\.life
os/docs/AUTH.md | debo\.life
os/tests/brand-rename.test.ts
.github/release-mobile-notes.md | earlier Debo build
.env.example | while mail\.daksha\.life is not verified
apps/web/wrangler.jsonc | debo\.life
apps/site/wrangler.jsonc | debo\.life
apps/pitch/wrangler.jsonc | debo\.life
os/infra/cloudflare/api/wrangler.jsonc | debo\.life
os/infra/cloudflare/app/wrangler.jsonc | debo\.life
.github/workflows/deploy-os.yml | debo\.life
.github/workflows/deploy.yml | debo\.life
.github/workflows/deploy-site.yml | debo\.life
.github/workflows/deploy-pitch.yml | debo\.life
AGENTS.md | old debo\.life addresses
docs/SETUP.md | from before the rename
os/apps/mobile/public/index.html | address from before the rename|a debo\.life page
```

## Re-run recipe

When this branch merges, text added to `main` in the meantime may still say Debo. From the repo root:

```sh
# 1. Rename every line the brand check would flag. Allowlisted lines and lines marked
#    "brand-check: keep" are left alone. It renames the repository link, then every
#    debo.life host (www, my, api, about, pitch, mail), then the word Debo / DEBO.
node scripts/check-brand.mjs --fix

# 2. Read the diff, then run the check again. It must pass.
git diff
node scripts/check-brand.mjs
```

The same replacements as a plain codemod, for a tool other than the script (it does not know the allowlist, so pass it only the files you mean to change):

```sh
perl -pi -e '
  s{playlikeboy/debo\.life}{playlikeboy/daksha}g;
  s{\b((?:www|my|api|about|pitch|mail)\.)?debo\.life\b}{($1 // "") . "daksha.life"}ge;
  s{\bDebo\b}{Daksha}g;
  s{\bDEBO\b}{DAKSHA}g;
' path/to/file ...
```

Then look at the diff by hand for these:

- `debo.apk`, `life.debo.app`, `debo://`, `@debo/`, `DEBO_*`, `"debo"` ids, storage keys and file names are untouched on purpose (they are not the whole word `Debo`, or not a `debo.life` host). Keep them.
- Text that reads oddly after the swap, like "renamed from Daksha to Daksha", needs a hand edit.
- A new user-facing string with a lowercase `debo` in it (a download file name, for example) is not caught by the check and needs a manual fix. `git grep -n debo -- ':!*lock*'` lists them.
- Code that compares against saved text (for example the "Debo:" lines in old calls, or a saved assistant name of "Debo") must keep accepting the old word. Mark such lines `brand-check: keep`.
- A line that must keep the old name gets `brand-check: keep` or an entry in the allowlist above.
