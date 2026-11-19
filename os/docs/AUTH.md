# Accounts: one login per person

This is how Daksha's agent platform knows who is asking. Two modes exist. The choice is `AUTH_MODE`.

| Mode | Who it is for | Who owns the data |
|---|---|---|
| `access-key` (default) | A local or sample install | One owner, `local-user`, behind one shared key (`OPENFUSE_ACCESS_KEY` in live mode) |
| `neon` | A shared deployment with real people | One owner per Neon Auth user, named by the user's id |

Live mode with `NEON_AUTH_JWKS_URL` set must use `neon`. The server refuses to start with `AUTH_MODE=access-key` in that case.

## How a request is signed in (neon mode)

1. The app sends email and password to Neon Auth over HTTP (`/sign-in/email`, `/sign-up/email`, `/email-otp/verify-email`). The same code runs on web, iOS and Android. These calls do not go to Neon's address directly: they go to the Daksha API at `/api/neon-auth/*`, which passes them on to Neon Auth and hands the answer back (`apps/server/src/neon-auth-proxy.ts`). The health route tells the app this address. Reason: when the app called Neon directly, the session cookie belonged to Neon's address, browsers treated it as a third-party cookie and often did not send it, Neon Auth then answered "no session", and people were signed out every few minutes ("Your session ended. Sign in again."). Through the API the cookie belongs to `api.daksha.life`, the same site as `my.daksha.life`. The pass-through stores and logs nothing, forwards only the headers sign-in needs, and all requests reach Neon Auth from the API's address, so Neon Auth's own per-address rate limits now count everyone together (not checked under load).
2. Neon Auth starts a session and keeps it in a cookie (`HttpOnly`, `Secure`, `SameSite=None`). The browser, or the phone's network layer, holds that cookie; the app never sees its value and stores only a marker that says a session should exist. Every call to Neon Auth is sent with `credentials: "include"`. If a Neon Auth has the Better Auth bearer plugin on, it also answers with a `set-auth-token` header, and the app then keeps that token (Keychain or Keystore on a phone, `localStorage` on the web) and sends it as a Bearer.
3. The app calls `GET /get-session` with that token and reads a short-lived JWT from the `set-auth-jwt` header. If the header is missing it calls `GET /token`. The JWT lasts 15 minutes. The app swaps in a new one 90 seconds before it runs out.
4. The app sends the JWT to the Daksha API as `Authorization: Bearer <jwt>`.
5. The API checks the JWT with `jose` against the public keys at `NEON_AUTH_JWKS_URL`: algorithm EdDSA only, issuer equal to the origin of `NEON_AUTH_BASE_URL`, audience equal to that origin when the token has one, expiry required. The `sub` claim must be a uuid. It becomes the owner of every row the request touches. Nothing is stored for the session on the API side, and no token is logged.

`POST /api/session` is closed in this mode. `GET /api/health` reports `auth: { mode, neonAuthUrl }` so the app picks the right sign-in screen.

Signed links for files and the browser console carry the owner and an HMAC over owner, path and expiry. They work per user and expire after 15 minutes.

## Sign-in on a phone

A phone app is not a browser, so two things differ.

- **No Origin header.** React Native's networking sends no `Origin` header. The API's own check (`apps/server/src/app.ts`) only refuses a request whose `Origin` is present and not allowed, so a phone request with none passes. Neon Auth (Better Auth) can refuse a cookie request that has none, and only origins in its trusted domains are accepted (`https://my.daksha.life` and the other daksha.life hosts are there, next to the old debo.life ones; see `docs/DOMAINS.md`). So the pass-through (`neon-auth-proxy.ts`) fills in the app's own address (the first `https://` entry of `ALLOWED_ORIGINS`, `https://my.daksha.life` in production) as `Origin` when the caller sent neither `Origin` nor `Sec-Fetch-Site`. Browsers always send `Sec-Fetch-Site`, so this never applies to a browser request. Tests: `tests/neon-auth-proxy.test.ts`.
- **The cookie.** The session cookie is kept by the phone's own network layer (iOS and Android cookie stores) and sent back because every call uses `credentials: "include"`. New app builds are pointed at `https://api.daksha.life`. Phone apps installed before the rename have `https://api.debo.life` built in; it is the same API and keeps working.

Not verified: none of this has run on a real phone or against the live Neon Auth from a phone. If a phone shows "Your session ended" straight after signing in, the first things to check are whether Neon Auth still sets the cookie as `SameSite=None; Secure` and whether the phone's cookie store keeps a `Partitioned` cookie.

## Settings

| Name | Meaning |
|---|---|
| `AUTH_MODE` | `neon` or `access-key`. Default: `neon` in live mode when `NEON_AUTH_JWKS_URL` is set, otherwise `access-key`. |
| `NEON_AUTH_BASE_URL` | The Neon Auth URL. Required for `neon`. Public. |
| `NEON_AUTH_JWKS_URL` | The key set URL. Defaults to `<base>/.well-known/jwks.json`. |
| `OS_DB_SCHEMA` | Postgres schema for the `records` table. Default `os` in `neon` mode. Created on start with `CREATE SCHEMA IF NOT EXISTS`. |
| `DATABASE_URL` | Daksha's Neon Postgres. The table is `os.records`, so it never touches Daksha's tables in `public` or Neon Auth's `neon_auth` schema. |
| `ALLOWED_ORIGINS` | Must list the web app's origin. Neon Auth's trusted origins must list it too, or the browser's sign-in call is refused. The first `https://` entry is the app's own address. |
| `PUBLIC_API_URL_ALIASES` | Optional. Other addresses the same API answers on, comma-separated (`https://api.daksha.life` in production). `/api/health` hands out sign-in on the alias it was called on, so the app at `my.daksha.life` signs in through `api.daksha.life` and its cookie stays same-site. See `docs/DOMAINS.md`. |

Live mode in `neon` mode does not need `OPENFUSE_ACCESS_KEY`. It still needs `TOKEN_ENCRYPTION_KEY`.

## Many people in one table

Every `Store` query filters by `owner`, with two deliberate exceptions that act on the whole table: `scan(kind)` (the task worker finds due work for all people and gets each owner back) and `recoverInterruptedActions()` (marks actions that were running when the server stopped). Nothing in the HTTP layer calls either. The `owner` is always taken from the verified token, never from the request body or query.

## Export and deletion

- `GET /api/account/export` returns every row the signed-in person owns as JSON. It leaves out `credentials` (encrypted Google tokens) and `sessions`.
- `DELETE /api/account` with body `{"confirm": true}` deletes every `os.records` row for that person and the PDF files stored for them on the API's disk. The app has "Download my data" and "Delete my data" on the Apps screen.

Deleting rows is not the whole job. These live elsewhere and need their own step:

1. **The login** in Neon Auth (`neon_auth.user`). The API cannot remove it. Remove it from Neon Auth, or from Daksha's web account page once that exists.
2. **Google access.** The stored Google tokens are deleted with the rows, but the app stays listed in the person's Google account until they remove it there. Revoke the token at Google before the wipe if you want it gone at once.
3. **The Linux computer or E2B desktop** for that owner: its Docker volume or VM and the files in it. Stop it first, then remove the volume or VM by hand.
4. **Browser worker sessions** for that owner. They close on their own when idle.
5. **Chat threads.** They are rows in the same table, so the wipe above removes them. Nothing is stored with CopilotKit Intelligence.
6. **Backups and logs.** Neon's point-in-time history keeps old rows until it ages out. Logs carry ids only.
7. **Anything Daksha's own app stores** for the same person in `public` tables. Those are a separate wipe.

## What is not verified yet

- Checked against Daksha's live Neon Auth on 14 November 2026: sign-in answers with a session cookie and no `set-auth-token` header (the bearer plugin is off), `get-session` with the cookie answers with `set-auth-jwt`, and `/token` returns the same JWT. The app's origin must be in Neon Auth's trusted domains, or sign-in answers 403 `INVALID_ORIGIN`. The cookie session has not been tried on an iPhone or Android phone yet.
- The `aud` claim is checked only when the token has one. Neon documents it as the auth URL's origin.
