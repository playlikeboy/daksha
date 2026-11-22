# Domains: daksha.life, and the debo.life addresses from before the rename

Daksha lives on **daksha.life**. The landing page is **https://www.daksha.life**. The debo.life addresses it had before the rename (see `RENAME.md`) stay attached to the same Workers. Their pages send people on to daksha.life with a 307, and the parts that installed apps and other services call keep serving.

Decision 34 (daksha.life as a twin) set up the daksha.life hosts. Decision 36 (the rename) made daksha.life the main site and turned the debo.life pages into redirects.

## Hosts

Every redirect is a **307** (temporary, easy to change later, keeps the method and body), and keeps the **path and query**.

| Host | Worker | Config | What it does |
|---|---|---|---|
| `www.daksha.life` | `debo-site` | `apps/site/wrangler.jsonc` | **Serves the landing page.** Its canonical address, sitemap, share (Open Graph) addresses and JSON-LD all say `https://www.daksha.life`. |
| `about.daksha.life` | `debo-site` | `apps/site/wrangler.jsonc` | Pages: 307 to the same path on `https://www.daksha.life`. Files (films, pictures) are still served. |
| `about.debo.life` | `debo-site` | `apps/site/wrangler.jsonc` | Same as `about.daksha.life`. |
| `daksha.life` | `debo-web` | `apps/web/wrangler.jsonc` | **Serves** `/privacy`, every `/api/*` route (the Neon Auth sign-in email webhook, voice, export, delete account) and files like `robots.txt` and `sitemap.xml`. `/` and other pages: 307 to the same path on `https://www.daksha.life`. The old `/home/*` screens: 307 to the matching screen on `https://my.daksha.life`, and `/auth/*` to the app. |
| `debo.life`, `www.debo.life` | `debo-web` | `apps/web/wrangler.jsonc` | **Serves every `/api/*` route**, so old webhook addresses keep working. Every other path: 307 to where that path ends up on daksha.life, in one hop (so `/privacy` goes to `https://daksha.life/privacy`, `/` to `https://www.daksha.life/`). |
| `my.daksha.life` | `debo-os-app` | `os/infra/cloudflare/app/wrangler.jsonc` | **Serves the app.** It talks to `api.daksha.life`. |
| `my.debo.life` | `debo-os-app` | `os/infra/cloudflare/app/wrangler.jsonc` | Every request, pages and files: 307 to the same path on `https://my.daksha.life`, sent by the Worker itself (`os/infra/cloudflare/app/src/redirect.ts`). A script at the top of the app's `index.html` does the same, as a second guard. |
| `api.daksha.life` | `debo-os-api` | `os/infra/cloudflare/api/wrangler.jsonc` | **Serves the API.** New builds of the app, web and phone, use it. Health and sign-in called here hand out `https://api.daksha.life/api/neon-auth`. |
| `api.debo.life` | `debo-os-api` | `os/infra/cloudflare/api/wrangler.jsonc` | **Serves the same API and never redirects.** Phone apps installed before the rename have it built in, and the Google, Composio and tool server (MCP) callbacks are registered on it. |
| `pitch.daksha.life` | `debo-pitch` | `apps/pitch/wrangler.jsonc` | **Serves the pitch.** |
| `pitch.debo.life` | `debo-pitch` | `apps/pitch/wrangler.jsonc` | Pages: 307 to the same path on `https://pitch.daksha.life`. Files (the deck PDF, pictures) are still served. |

`www.daksha.life` was a custom domain on `debo-web` before. A custom domain can only be on one Worker, so it is now only in `apps/site/wrangler.jsonc`. In a CI deploy, wrangler moves a custom domain from another Worker to the one being deployed, and each deploy makes a Worker's custom domains exactly the ones in its config, so the order of the two deploys does not matter. While it moves, `debo-web` serves `www.daksha.life` rather than send it back to itself.

Where the rules live, each with tests:

| Worker | Rules | Tests |
|---|---|---|
| `debo-web` | `apps/web/src/lib/host-redirect.ts`, used by `apps/web/src/proxy.ts` | `apps/web/src/lib/host-redirect.test.ts` |
| `debo-site` | `apps/site/src/host-redirect.ts`, used by `apps/site/src/proxy.ts` | `apps/site/src/host-redirect.test.ts` |
| `debo-pitch` | `apps/pitch/src/host-redirect.ts`, used by `apps/pitch/src/proxy.ts` | `apps/pitch/src/host-redirect.test.ts` |
| `debo-os-app` | `os/infra/cloudflare/app/src/redirect.ts`, used by `app/src/index.ts` | `os/tests/app-redirect.test.ts` |

### Files and video

On `debo-site`, `debo-pitch` and `debo-web`, Cloudflare serves files from the build (films, posters, pictures, the deck PDF, `og.png`) before the Worker runs. So old links to a file on `about.debo.life` or `pitch.debo.life` keep working as they are, and video keeps its Range requests. The README links to the films on `www.daksha.life`.

On `my.debo.life` the Worker runs first for every request (`run_worker_first`), so files there get a 307 too. A 307 keeps the method, and a browser sends the `Range` header again to the new address, so partial downloads and video work after the redirect.

## Sign-in and the API address

The app signs in through the API (`/api/neon-auth/*`, see `os/docs/AUTH.md`), and Neon Auth's session cookie belongs to the API address. A browser only keeps sending it when the API is the **same site** as the page, so the app at `my.daksha.life` must sign in through `api.daksha.life`.

- The app is built with `EXPO_PUBLIC_API_URL=https://api.daksha.life`, for the web (`deploy-os.yml`) and for the phone (`release-mobile.yml`). Phone apps installed before the rename keep `https://api.debo.life`, which keeps working. Both builds also set `EXPO_PUBLIC_API_URL_FALLBACK=https://api.debo.life` and `EXPO_PUBLIC_AUTH_MODE=neon`. At start the app asks `/api/health` on the main address, then the fallback, four rounds over about 10 seconds, and keeps the first that answers for the whole session (`os/apps/mobile/src/api-health.ts`). A build made for Neon sign-in, or the app opened on a `daksha.life` or `debo.life` address, never shows the access-key screen: when nothing answers it says "Can't reach Daksha right now" with a Try again button. On the fallback, a browser keeps sign-in in a cookie for `api.debo.life`, so a browser that blocks third-party cookies (Safari) may need to sign in again there.
- `PUBLIC_API_URL=https://api.debo.life`. It is the address other services keep on file: the Google callback (`/api/google/callback`), the Composio callback (`/api/connectors/callback`), the tool server (MCP) OAuth callback and signed file links are built from it. It stays there until the owner registers the daksha.life callbacks (below), so connecting apps keeps working with no owner action.
- `PUBLIC_API_URL_ALIASES=https://api.daksha.life`. When `/api/health` or sign-in is called on `api.daksha.life`, the API hands out `https://api.daksha.life/api/neon-auth`. Any other host gets `PUBLIC_API_URL`, so a made-up `Host` header cannot choose it (`os/apps/server/src/public-address.ts`).
- `ALLOWED_ORIGINS=https://my.daksha.life,https://my.debo.life`. The first `https://` entry is the app's own address: the API uses it for links back to the app (for example after connecting an app, even though the callback itself lands on `api.debo.life`) and as the `Origin` it sends to Neon Auth for phone sign-in. `my.debo.life` stays allowed for a tab that still runs an old copy of the app.
- `os/apps/mobile/src/api-address.ts` still swaps the API for the page's own site on the web, so an old copy of the app running on `my.debo.life` would use `api.debo.life`. With the 307, that only happens for a page that was already open.

What a person notices: on `my.daksha.life` they sign in once more, because browser storage, unsaved drafts and reminder (web push) settings belong to each address. The account, entries and memories are the same.

## The owner's steps

Nothing here is needed for the deploy to work. Neon Auth's trusted domains already include `daksha.life`, `www.daksha.life`, `my.daksha.life`, `about.daksha.life` and `api.daksha.life`, so nothing is needed there.

1. **Cloudflare deploy token.** The `CLOUDFLARE_API_TOKEN` GitHub secret needs Workers edit and DNS edit on the `daksha.life` zone, as on `debo.life`. The daksha.life custom domains from decision 34 are already attached, so this is already true if those deploys passed. The deploys create or move the custom domains themselves.
2. **Android download link.** The site and README link to `.../releases/latest/download/daksha.apk`. The newest release before this change has only `debo.apk`. The phone build that runs after this merges publishes `daksha.apk`; until it finishes (about half an hour), that link answers 404. To close the gap, upload a copy of the current `debo.apk` as `daksha.apk` to the latest release, or start the "Release mobile" workflow by hand.
3. **Later, to move the callbacks to `api.daksha.life`** (optional; nothing breaks if this waits):
   - Google Cloud OAuth client: add `https://api.daksha.life/api/google/callback`, keep the old one.
   - Composio: allow `https://api.daksha.life/api/connectors/callback` if your project keeps an allowlist.
   - Then in `deploy-os.yml` swap them: `callback_api` becomes `https://api.daksha.life`, and add `https://api.debo.life` to `PUBLIC_API_URL_ALIASES`. Tool servers (MCP) register again for the new callback the next time a person signs in to one (`os/apps/server/src/mcp/oauth.ts`).
4. **Neon Auth email webhook.** Nothing to do: `https://debo.life/api/neon-auth/webhook` keeps working, because `/api/*` never redirects. To move it, set it to `https://daksha.life/api/neon-auth/webhook`.
5. **GitHub.** Set the repo's website field to `https://www.daksha.life` if you like.

## Checks after a deploy

The deploy workflows check these and warn (or fail, for the hosts that must work):

- `deploy-site.yml`: `www.daksha.life` answers 200 (fails otherwise); `about.daksha.life` and `about.debo.life` answer 307 to `www.daksha.life` (warns).
- `deploy.yml`: `daksha.life/privacy` answers 200 (fails otherwise); `daksha.life/`, `debo.life/privacy` and `www.debo.life/` answer the right 307, and the webhook route answers on both `daksha.life` and `debo.life` (warns).
- `deploy-pitch.yml`: `pitch.daksha.life` answers 200 (fails otherwise); `pitch.debo.life` answers 307 (warns).
- `deploy-os.yml`: `api.daksha.life/api/health` is up and hands out its own sign-in address; `api.debo.life/api/health` is up with its own; `my.daksha.life` serves the app; `my.debo.life/journal?x=1` answers 307 to `https://my.daksha.life/journal?x=1` (all fail the deploy otherwise).
