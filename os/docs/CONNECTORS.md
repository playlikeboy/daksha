# Connected apps (Composio)

A person can connect apps such as Gmail, Slack, Notion, GitHub and Google Drive, then ask Daksha to use them from chat, tasks and voice. Daksha reaches the apps through [Composio](https://composio.dev). The product plan for connectors is in [`docs/CONNECTORS.md`](../../docs/CONNECTORS.md) at the repo root; this file describes what is built in `os/`.

## What the person sees

- **Apps screen, "Connect your apps".** A short first list of apps with one honest line each and their logo (a letter if there is none). One search box ("Search all apps") narrows that list and searches the whole catalogue, a page at a time. **Show more apps** walks the rest of the catalogue page by page, with category buttons, a count, and loading, empty and error states. An app that Composio cannot sign in for (it needs the owner's own OAuth app) says so and shows no button. A connected app has **Disconnect** (it asks first).
- **Your own tool servers.** Below the apps, "Add your own tool server (MCP)". See "Custom tool servers (MCP)" further down.
- **Connecting.** The person signs in on the app's own page, hosted by Composio. Daksha never sees the password. On the web the page opens in a new tab; on a phone it opens in an in-app browser sheet that closes itself. The screen checks again when they come back.
- **Chat.** A card says which app was used ("Looked in Gmail"). A change shows "Asked to send a message in Slack: waiting for your yes" and a button that opens the exact review.
- **Not set up.** Without `COMPOSIO_API_KEY` the section says "Connecting apps is not set up yet." Nothing else changes.

## How it works

Code: `apps/server/src/connectors/`.

| File | Job |
|---|---|
| `types.ts` | Shapes shared by the rest. The `ConnectorBackend` interface is the one edge to the provider. |
| `composio.ts` | The real backend. The only file that imports `@composio/core`. |
| `fake.ts` | An in-memory backend for tests and for practice mode. |
| `service.ts` | The rules: owner scoping, catalogue cache, risk, previews, wrapping, rate limits, logs. |
| `risk.ts` | Read, write or destructive, from the provider's hints. |
| `tools.ts` | The two agent tools, for chat and for tasks. |
| `routes.ts` | The HTTP routes and the public callback page. |
| `curated.ts` | The first list and its one-line descriptions. |

### The Composio approach, and why

Composio has three ways to give an agent its tools: a session that hands the model a few meta tools, a session over MCP, and direct execution (legacy). Daksha uses **a session for the person, driven from the server**, with its own two tools on top:

- `find_app_tools` calls `session.search({ query, toolkits })`, limited to apps the person has connected.
- `use_app_tool` calls `session.execute(slug, args)` after Daksha's own checks.

Why not hand the model Composio's meta tools (`COMPOSIO_MULTI_EXECUTE_TOOL` and friends) directly: they would let the model run a tool in one step, and they include a remote shell and a code workbench. Daksha needs to look at every call first to decide whether it only reads or changes something, and to put changes through its own review, which a person approves on screen. Composio's own Approvals feature is experimental and asks the person inside the model client; Daksha's review flow is the one every other change already uses. Two small tools also keep the model's context small, which is the point of Composio's "search, then execute" design, and the same code serves chat, tasks and voice.

Docs used (checked November 2026): [sessions](https://docs.composio.dev/docs/configuring-sessions.md), [session methods](https://docs.composio.dev/reference/sdk-reference/typescript/session.md), [manual authentication](https://docs.composio.dev/docs/authentication/manually-authenticating.md), [tool hints](https://docs.composio.dev/docs/governance/tool-hints.md), [rate limits](https://docs.composio.dev/reference/rate-limits.md).

Package: `@composio/core` pinned at 0.27.0. 0.28.0 and 0.29.0 were under two weeks old when this was added; the repo's release-age rule applies. Telemetry in the SDK is turned off (`allowTracking: false`).

### Who is who

Each Daksha person is exactly one Composio user: their **owner id** (a Neon Auth uuid). The id always comes from the signed-in session. Nothing the client sends can name another person. Disconnect looks the connection up in the caller's own accounts, so another person's connection id gets the same "not found" as one that does not exist. Every tool call runs in a session limited to that person's connected accounts, and each app is pinned to the account id Daksha checked.

### Routes

| Route | Job |
|---|---|
| `GET /api/connectors` | The person's connections (with state) and the first list. |
| `GET /api/connectors/search?q=&category=&offset=&limit=` | Search or browse the whole catalogue. Apps that can be connected come first. Returns `items`, `total`, `nextOffset` (null at the end) and, on the first page, `categories`. `limit` is 1 to 50 (default 20). With no `q` it is every app. |
| `POST /api/connectors/:toolkit/connect` | Starts a connection. Returns Composio's hosted link. Body `{ "to": "web" \| "native" }`. |
| `DELETE /api/connectors/:id` | Disconnects and really deletes the connected account at Composio. |
| `GET /api/connectors/callback` | Public. Where Composio sends people after sign-in, on the API address the app called. Fixed words only; changes nothing. |
| `DELETE /api/account` | Also deletes every connected account the person has at Composio, before anything else is removed. |
| `GET /api/account/export` | Adds `connectedApps`: app, state and date. Never a token. |

Connection states in plain words: connected; waiting ("Waiting for you to finish signing in"); failed; expired (a link nobody finished after 30 minutes, or a sign-in that ran out). Trying to connect again removes the old unfinished attempt.

### Catalogue

The list comes from `GET https://backend.composio.dev/api/v3/toolkits` and is cached in memory for six hours (the SDK's list call stops at 1,000 rows, so Daksha pages the REST API with a cursor). In November 2026 it held 1,742 apps (checked live, read-only: 871 pages of 2, `total_items` 1742; the API's `search=` and `category=` filters work, but its `managed_by=` filter is ignored). Each app carries `meta.logo` (a `logos.composio.dev` URL) and `meta.categories` (names with inconsistent capitals, so Daksha matches them without caring about case). Search and paging run in Daksha over the cached list, so they cover every app. **Only 128 have Composio-managed sign-in**, so only those can be connected with one tap. The others need the owner to register their own OAuth app and an auth config in the Composio dashboard; until then they show as "Not available yet". Among the 16 apps in the first list, Telegram (bot token only) and Spotify have no managed sign-in today.

### Gmail and Google Calendar

Daksha also has an older built-in Google connection (`google-auth.ts`) with richer tools (full threads, drafts, PDFs, calendar edits with reviews). It needs Daksha's own Google OAuth app, which production does not have.

- **Which tools the chat agent gets.** The older tools `search_mail`, `read_mail_thread` and `read_calendar` are offered **only** when this person's own Google connection is on (or in a sample workspace). Otherwise they do not exist for that reply, so the model cannot pick them and fail with "Google is disconnected". Mail and calendar then go through `find_app_tools` and `use_app_tool` on the person's Composio Gmail and Google Calendar. (This was a real bug: a person who connected Gmail through Apps was told "Google is disconnected".)
- **What the prompt says.** Every reply lists the apps the person has connected right now, tells the agent to act straight after `find_app_tools` (pick sensible values, do not ask which tool or account), and to point people to Apps, under Connect your apps, for an app that is not connected.
- When Daksha has its own Google sign-in (or in a sample workspace) the apps list leaves Gmail and Google Calendar out, so there is never a second "Gmail" card, and when the older Google is connected the agent uses it and ignores a Composio Gmail.
- **Screens.** The Mail, Calendar and Today screens read the older connection. When it is not on, they say "Your calendar lives in Apps" or "Daksha reads your mail through the apps you connect" with a **Connect your apps** button, instead of a dead Google sheet. They are not yet fed from Composio; ask Daksha in chat or by voice.
- Delegated tasks (`delegate_task`, the worker) still use the older Google tools for forms and drafts, and the Composio apps through the same two tools.

### Big answers

An app can return a whole mailbox. `wrapAppData` shortens every long text (4,000 characters, then 400 if the total is still too big) and every long list (25 items, then 15) first, so every item still shows, and only then cuts the total at 16,000 characters. The notice tells the agent when something was shortened.

### Chat and voice

Chat and voice run the same agent (`engine/conversation.ts`; voice sets the channel to "voice" and uses `voice/engine-brain.ts`). Both get the same connector tools. A change by voice becomes an on-screen review, and the voice brain says out loud that it is waiting on screen (`APPROVAL_MESSAGE`) whatever the model wrote. Tests: `tests/connectors-power.test.ts` and `tests/mcp.test.ts`.

## Safety rules

1. **Reads run, changes wait.** Risk comes from Composio's hints on each tool (`readOnlyHint`, `createHint`, `updateHint`, `destructiveHint`), never from the model. A tool with no hints is a change. A tool whose name says send, delete, create and so on is a change even if a hint says read. The meta tools (`COMPOSIO_*`) cannot be reached at all.
2. **A change becomes a review.** It does not run. Daksha prepares an action of kind `connector.call` and shows the person which app, what will happen and the exact values, in the same review sheet as an email. It runs only after they approve on screen. The proposal is bound to the exact arguments (a hash) and to the connected account; if the app was disconnected meanwhile the approval fails and nothing runs. Reviews expire after 30 minutes.
3. **Voice cannot approve** (`docs/VOICE.md`, rule 4). Voice can ask Daksha to prepare a change, but approval is only the signed-in HTTP route, from the app.
4. **No autonomy setting yet.** Daksha has no "act without asking" setting, so every change asks, every time.
5. **Results are data, not instructions.** What an app returns is wrapped in `<<<APP DATA … END APP DATA>>>` with a notice, any marker characters inside it are neutralised, and it is cut to 24,000 characters. Even a model that obeys text inside a result can only prepare a review; it can never send.
6. **Logs hold ids and outcomes only**: person id, app, tool name, success, Composio's log id. Never arguments or results. Tests check this.
7. **Rate limits per person**: 40 tool calls a minute, 10 connect links in ten minutes. (Composio also limits the whole organisation: 2,000 requests a minute on Hobby, 10,000 on Pro.)
8. **The person owns it.** Disconnect deletes at the provider. Account wipe deletes every connected account first, and stops with nothing else deleted if Composio cannot. Export lists apps and dates.

## Costs and plan limits

Composio bills the project (Daksha), not each person. Sources: [composio.dev/pricing](https://composio.dev/pricing) and the [rate limits page](https://docs.composio.dev/reference/rate-limits.md).

- Rate limits, from the docs: Hobby 2,000 requests a minute for the whole organisation, Pro 10,000, Enterprise custom. Every call to Composio counts, including listing connections.
- The pricing page I could read shows the plans for Composio **For You** (free: up to 3 members, 10,000 tool calls a month, up to 10 linked accounts per app; Standard: $18 per seat a month; extra tool calls $0.005 each). **Daksha uses the Platform product** (SDK sessions, `ak_…` project key), whose plan table I could not read from the page. Check Platform plan quotas and price in the dashboard under Billing before launch. Not verified.
- The docs say private custom MCP toolkits need Pro. Daksha does not use them.
- Each tool call is one billed call. A single request can make a few Composio calls: a session create, a search, the hints lookup, the run. Daksha caches tool hints for 10 minutes and the catalogue for 6 hours to keep this down.
- Each connected app also has its own quota (for example Slack). Managed sign-in shares one quota across all of Daksha's people. If that bites, register Daksha's own OAuth app for that app.

## Owner setup

1. In the [Composio dashboard](https://dashboard.composio.dev) open Platform, choose the project, and copy the project API key (`COMPOSIO_API_KEY`). Set it as a GitHub secret named `COMPOSIO_API_KEY`. It is optional: if the secret is empty the deploy still works and the feature says it is not set up.
2. No auth configs are needed for the 128 managed apps. For anything else, add an auth config with your own OAuth app, then expect the new app to appear as connectable only after Daksha is changed to look for it. Today Daksha lists only managed apps as connectable.
3. **Callback address.** Composio keeps no return address on file: Daksha sends one with each connect link. It is the API address the app called plus `/api/connectors/callback`, so the app at `my.daksha.life` sends people back to `https://api.daksha.life/api/connectors/callback`, and older phone apps to `https://api.debo.life/api/connectors/callback` (`PUBLIC_API_URL`, and its aliases in `PUBLIC_API_URL_ALIASES`; any other host gets `PUBLIC_API_URL`). Composio's docs describe no allowlist. If the dashboard ever shows a list of allowed redirect or callback URLs for the project, add both addresses.
4. For phones, the in-app browser returns to `debo://connectors`. The app scheme `debo` is already set in `app.json`. Adding `expo-web-browser` needs a new native build.
5. Optional: Composio's Firewall (blocks prompt injection in tool results) is a paid-plan feature and is not used; Daksha's own wrapper and review flow do the work.
6. Privacy page: `apps/web/src/app/privacy/page.tsx` says what Composio holds. Keep it true if the setup changes.

## Trying it without Composio

In a sample workspace, `DEBO_SAMPLE_CONNECTORS=1` swaps in a practice copy with a few fake tools (Gmail, Slack, Notion, Todoist, GitHub). It never reaches a real app. A live workspace refuses this switch. Tests use the same fake: `tests/connectors.test.ts`.

The one live test (`COMPOSIO_LIVE=1`, needs `COMPOSIO_API_KEY`) lists the catalogue and makes a connect link for a random test user, completes no sign-in, then deletes the account it made. It never runs a tool.

## Known limits

- One account per app per person. Connecting a second Slack workspace is not supported yet.
- A change that times out after it may have reached the app is recorded as "outcome unknown", not retried.
- No triggers or background watching of connected apps yet.
- Tool schemas shown to the model are shortened to 14 arguments each.

## Custom tool servers (MCP)

A person can add their own tool server on the Apps screen: a name, an https address and either an optional secret (a bearer token, or one custom header name and value) or a sign-in on the server's own page (OAuth, see "Signing in to a tool server" below). Code: `apps/server/src/mcp/`. Routes: `GET/POST /api/mcp` (POST also takes `auth: "sign-in"`, `preset: "composio"`, `to: "web" | "native"`), `POST /api/mcp/:id/refresh`, `POST /api/mcp/:id/sign-in` (`{ to }`, answers `{ url }`), `DELETE /api/mcp/:id/sign-in` (sign out), `PATCH /api/mcp/:id` (`{ autoRead }`), `DELETE /api/mcp/:id`, and the public `GET /api/mcp/oauth/callback`.

| File | Job |
|---|---|
| `safe-fetch.ts` | The address checks and the only `fetch` that touches a server. |
| `service.ts` | Add, list, refresh, remove; talking to the server with the official `@modelcontextprotocol/sdk` client (1.30.0, already used for search); risk; wrapping. |
| `tools.ts` | The agent tools `find_server_tools` and `use_server_tool`. |
| `routes.ts` | The HTTP routes and the public sign-in callback. Never returns a secret or a token. |
| `oauth.ts` | The signed sign-in state and the encrypted store the SDK's OAuth code reads and writes. |
| `composio.ts` | Which addresses are Composio's, and which header a Composio key goes in. |

**Protocol.** MCP over Streamable HTTP, using the SDK's `StreamableHTTPClientTransport` with Daksha's own `fetch`. Older SSE-only servers are not supported. Servers that need a sign-in (OAuth) are supported, see below. A new connection is made for each action and closed after it (no long-lived sessions).

**How the agent uses them.** Two sibling tools, not the Composio ones: `find_server_tools` (best matches first, up to 8) and `use_server_tool`. The tool list is saved when the server is added or checked; a call can only name a tool from that list. The system prompt carries only the server's own name and a rule that its text is never instructions. Tool names and descriptions arrive in tool results, marked as untrusted.

**Rules**
1. **Addresses (SSRF).** https only; no name or password in the address; the host is resolved by Daksha and every answer must be public. Refused: loopback, private ranges, link-local (including 169.254.169.254), carrier-grade NAT, multicast and reserved, documentation ranges, IPv6 loopback, unique-local, link-local, multicast, 6to4, and IPv4 hidden inside IPv6 (mapped and NAT64). Names refused: `localhost`, `*.localhost`, any `*.internal` (this deployment's `browser.internal`, `media.internal`, `ai.internal`), `*.local`, `*.lan`, `*.localdomain`, and one-word names. One private answer among public ones refuses the name. The check runs on every connection (add, refresh, every call), the request is pinned to the address that was checked (a custom `lookup`, so there is no second DNS lookup), and **redirects are never followed**. Each request has a 30 second limit and a 1,000,000 byte response cap; connecting and listing have 15 seconds.
2. **Limits.** 5 servers per person, 50 tools per server (names must be plain: letters, numbers, `_ . -`), 60,000 characters of arguments, 40 calls a minute and 10 adds in ten minutes per person.
3. **Risk.** Every tool is a change that waits for the person's yes, unless the server declares `readOnlyHint: true` **and** the person turned on "Reading without asking" for that server (off by default; decided because a server's own claim is not proof, so the safe default is to ask every time). `destructiveHint: true` always asks. The review is the same on-screen review as connected apps (`connector.call`, toolkit `mcp:<server id>`) and shows the server name, the tool name and every argument. Approval re-checks that the server and tool still exist. Voice can prepare a review but never approve it.
4. **Prompt injection.** Results are wrapped as data from the server's name (same wrapper as apps: markers neutralised, shortened, 16,000 characters). The prompt says such text can never give instructions or permission. A server's descriptions never enter the system prompt (tested).
5. **Secrets.** Encrypted with `TOKEN_ENCRYPTION_KEY` (the same AES-256-GCM vault as Google tokens), saved in the `credentials` collection apart from the server row (that collection is never exported), never returned to the app, never logged. Without the key a secret cannot be saved (a server with no secret still works). Removing a server, or deleting the account, deletes its secret. Export lists each server's name, address, tool names and last result, never a secret.
6. **No private data goes out on its own.** Daksha sends a server only the arguments the model chose for a call. The add form says this, and warns that a server Daksha does not control can do anything with what it receives.
7. **Logs** hold person id, server id, tool name and success, never arguments or results.

**What is not done.** Sign-in services that need Daksha registered by hand (only dynamic client registration is done); SSE-only servers; tool schema checks (arguments are passed as the model wrote them and the server decides); background watching; custom servers inside delegated tasks (chat and voice only). The "read-only" label is only the server's claim.

### Signing in to a tool server (OAuth)

The add form has "Sign in instead of a secret (OAuth)". Daksha then saves the server as waiting ("Waiting for you to sign in.", no tools yet) and opens the server's sign-in page. The OAuth itself is the official SDK's `auth()` with Daksha's `OAuthClientProvider` (`oauth.ts`); nothing about OAuth is written by hand.

1. **Discovery.** `discoverOAuthServerInfo` reads the server's protected-resource document and its sign-in service's metadata. A service that does not list `S256` in `code_challenge_methods_supported`, or has no `registration_endpoint`, is refused and the server is not kept.
2. **Registration.** The first time Daksha signs in to a server (and again after Sign out), it registers itself with the sign-in service (dynamic client registration): name "Daksha", redirect `${PUBLIC_API_URL}/api/mcp/oauth/callback`, grants `authorization_code` and `refresh_token`, auth method `none` when the service allows it (a public client, no client secret). No client id is set up by hand.
3. **Scopes.** The scopes the server's document lists; if it lists none, only `openid offline_access` when the service offers them (enough to stay signed in, nothing about the person's profile).
4. **State.** `base64url(json).base64url(hmac)` with the owner, the server id, a random nonce, web or native, and a 10 minute expiry. The key is `Auth.purposeKey("mcp-oauth-state")`, an HMAC of `SESSION_SIGNING_KEY`, so the signing key itself is not passed around. The nonce is saved with the PKCE verifier; the callback checks the signature, the expiry, that the server belongs to that owner and that the nonce matches, and deletes the nonce **before** swapping the code, so a state works once. Starting a new sign-in makes older links useless.
5. **Callback.** `GET /api/mcp/oauth/callback` is mounted before the session check (like the Google and Composio callbacks). It shows fixed words only ("You are signed in" or "That did not finish"), with `default-src 'none'`, and sends the phone app to `debo://tool-servers?status=success|failed`. On success it lists the server's tools.
6. **Tokens.** The client registration, tokens, their expiry and the discovery documents are one encrypted record (`TOKEN_ENCRYPTION_KEY`, AES-256-GCM) in `credentials`, id `mcp-oauth-<server id>`, apart from the server row. Never returned by any route, never exported, never logged. Without `TOKEN_ENCRYPTION_KEY` sign-in is refused.
7. **Staying signed in.** Before each connection, a token that runs out within 60 seconds is refreshed (one refresh at a time per server in this process). A 401 from the server makes the SDK refresh and retry once. If the refresh is refused, the server is marked "Sign in again" and nothing more is sent until the person signs in. A service that sends no new refresh token keeps the old one.
8. **Sign out and remove.** Sign out deletes the token record and keeps the server. Remove deletes both. Neither tells the sign-in service: Daksha only forgets the tokens (Composio offers no way to take them back).
9. **Everything over the checked fetch.** Discovery, registration and token requests all go through `safe-fetch.ts` (public https only, pinned, no redirects, size and time limits); it sends a form body (URLSearchParams) for the token requests. The sign-in page itself must also be on a public https address.
10. **Writes still wait.** Signing in changes only how Daksha gets in. Every change still waits for the person's yes, exactly as above.

### Bring your own Composio

This is the person's **own** Composio account, not the apps Daksha connects for them with Daksha's key (top of this file). The Apps screen card "Composio: connect all your apps at once" offers:

- **Sign in with Composio**: adds `https://connect.composio.dev/mcp` (Composio Connect: every app the person connected in their Composio account) with the sign-in above. Checked live on 15 November 2026 (anonymous, read-only): its protected-resource document names `https://connect.composio.dev` as sign-in service; its metadata lists authorize `connect.composio.dev/oauth/authorize`, token `login.composio.dev/oauth2/token`, registration `login.composio.dev/oauth2/register`, PKCE `S256` only, auth method `none`, scopes `openid profile email offline_access`, no revocation endpoint. An unauthenticated MCP request answers 401.
- **Use an API key**: the same address with the key in `x-consumer-api-key`, or a Composio project address (`https://backend.composio.dev/v3/mcp/<id>?user_id=...`) with the project key in `x-api-key` (docs.composio.dev, November 2026). The header is filled in from the address and can be changed.

The server refuses `preset: "composio"` for any address that is not on `composio.dev`. Everything else is the same as any tool server: the tools Composio lists, reviews for every change, the same limits.

**Checked and not checked.** Tests use an in-process fake server. By hand, once, the real pinned `fetch` plus the SDK were run against a local https MCP server (add, list, call, the size cap and a redirect). Sign-in tests (`tests/mcp-oauth.test.ts`) use a fake sign-in service and server: registration, PKCE S256 checked at the token step, the full start, callback, list and approved call, refresh early and on 401, a refused refresh, replayed, changed and old states, sign out, and that no token reaches a route, the export, the logs or the database in clear text. Not checked against a real Composio sign-in or key (no account here), nor two server copies refreshing the same token at once (the lock is per process). Not checked against any real third-party MCP server, a real DNS rebinding attempt, or Cloudflare's container network. A response over the size cap currently fails after the 30 second call limit instead of at once, and the error then says "took too long".
