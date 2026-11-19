# Domains: debo.life and daksha.life

Debo answers on two sites that show the same thing. **debo.life is the main one.** daksha.life is a twin: every debo.life host has a daksha.life host served by the same Cloudflare Worker. Nothing a person reads is renamed, and links, canonical addresses and sitemaps still point at debo.life.

## Hosts

| debo.life host | daksha.life twin | Worker | Config | How the twin is served |
|---|---|---|---|---|
| `debo.life`, `www.debo.life` | `daksha.life`, `www.daksha.life` | `debo-web` | `apps/web/wrangler.jsonc` | Same Worker. `/privacy` and every `/api/*` route work; `/` still redirects to `https://about.debo.life`, and old screens to `https://my.debo.life`. |
| `about.debo.life` | `about.daksha.life` | `debo-site` | `apps/site/wrangler.jsonc` | Same Worker, same page. Its canonical address stays `https://about.debo.life`. |
| `pitch.debo.life` | `pitch.daksha.life` | `debo-pitch` | `apps/pitch/wrangler.jsonc` | Same Worker. `pitch.daksha.life` was attached by hand before; it is now in the config too. |
| `my.debo.life` | `my.daksha.life` | `debo-os-app` | `os/infra/cloudflare/app/wrangler.jsonc` | Same build of the app. On `my.daksha.life` it talks to `api.daksha.life` (see sign-in below). |
| `api.debo.life` | `api.daksha.life` | `debo-os-api` | `os/infra/cloudflare/api/wrangler.jsonc` | Same Worker and container. Hands out sign-in on the address it was called on. |

Each twin is a Worker custom domain. `wrangler deploy` creates it and its DNS record the first time the deploy workflow runs. Each deploy workflow checks its twin afterwards but only warns if it does not answer yet, because a new custom domain can take a few minutes to get its certificate.

## Sign-in on both sites

The app signs in through the API (`/api/neon-auth/*`, see `os/docs/AUTH.md`), and Neon Auth's session cookie belongs to the API address. A browser only keeps sending that cookie when the API is the **same site** as the page. `my.debo.life` and `api.debo.life` are the same site. `my.daksha.life` and `api.debo.life` are not: there the cookie would be a third-party cookie, which Safari and many other browsers refuse, and people would be signed out.

So each site uses its own API host:

- The app is built once with `EXPO_PUBLIC_API_URL=https://api.debo.life`. On the web, a page on `my.daksha.life` swaps that for `https://api.daksha.life` (`os/apps/mobile/src/api-address.ts`). Phones, local runs and previews keep the built-in address.
- The API knows its extra address from `PUBLIC_API_URL_ALIASES=https://api.daksha.life`. When `/api/health` is called on `api.daksha.life`, it hands out `https://api.daksha.life/api/neon-auth` as the sign-in address. Any other host gets `PUBLIC_API_URL` (`https://api.debo.life`), so a made-up `Host` header cannot choose it (`os/apps/server/src/public-address.ts`).
- `ALLOWED_ORIGINS` is `https://my.debo.life,https://my.daksha.life`. `my.debo.life` stays first: the API uses the first `https://` origin as the app's own address, for "Back to Debo" links after connecting an app and as the `Origin` it sends to Neon Auth for phone sign-in.

What stays on `api.debo.life` on purpose: the Google, Composio and tool server (MCP) callback addresses and signed file links. They are built from `PUBLIC_API_URL`, because the callback addresses are registered once with those services, and signed links carry their own token, so they need no cookie.

What a person notices: `my.debo.life` and `my.daksha.life` keep separate sign-ins, unsaved drafts and reminder (web push) settings, because a browser keeps these per site. The account, entries and memories are the same. After connecting an app or a tool server from `my.daksha.life`, the "Back to Debo" link goes to `my.debo.life`.

The redirect fallback (sending `my.daksha.life` to the same path on `my.debo.life`) was not needed, because both the API and Neon Auth accept more than one origin.

## The owner's manual steps

Nothing on debo.life depends on these. Until they are done, the daksha.life twins show their pages, but **signing in on my.daksha.life does not work** (Neon Auth refuses it; the app may ask for an email code that never helps).

1. **Neon Auth trusted domains (required for sign-in on my.daksha.life).** In the Neon console, Auth settings, add `https://my.daksha.life`. Without it Neon Auth answers 403 `INVALID_ORIGIN`. Keep every `debo.life` entry. Adding `https://daksha.life` as well does no harm.
2. **Cloudflare deploy token.** The token in the `CLOUDFLARE_API_TOKEN` GitHub secret needs Workers edit and DNS edit on the `daksha.life` zone, as it has on `debo.life`. If it does not, the deploys fail at the custom domain step; the new Worker code is already uploaded by then, and the debo.life hosts keep working. On 19 November 2026 no DNS record used `daksha.life`, `www`, `about`, `my` or `api`, so nothing blocks the custom domains. `pitch.daksha.life` is already attached to `debo-pitch`. Mail records exist only under `mail.daksha.life`.
3. **Google OAuth and Composio.** Nothing to do now: their callbacks stay on `https://api.debo.life`. Only if `PUBLIC_API_URL` ever moves to `api.daksha.life`, add `https://api.daksha.life/api/google/callback` to the Google OAuth client, and `https://api.daksha.life/api/connectors/callback` to Composio if it keeps an allowlist.
4. **Neon Auth email webhook.** Nothing to do: it stays on `https://debo.life/api/neon-auth/webhook`, and `https://daksha.life/api/neon-auth/webhook` works too.

## Moving daksha.life to main later

The branch `daksha-rename` (not merged) renames the brand and moves hosting to daksha.life; see its `docs/RENAME.md`. To make daksha.life the main site without the rename, swap the order: `PUBLIC_API_URL=https://api.daksha.life`, `PUBLIC_API_URL_ALIASES=https://api.debo.life`, `my.daksha.life` first in `ALLOWED_ORIGINS`, build with `EXPO_PUBLIC_API_URL=https://api.daksha.life`, and do step 3 above first.
