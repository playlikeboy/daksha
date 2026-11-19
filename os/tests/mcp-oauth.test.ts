// Signing in to a tool server (OAuth) and bringing your own Composio. Everything runs against a
// fake sign-in service and a fake MCP server inside this process: no network, no real account.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { EventType, type RunAgentInput } from "@ag-ui/core";
import { Hono } from "hono";
import { lastValueFrom, toArray } from "rxjs";
import { accountRoutes } from "../apps/server/src/account.ts";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore } from "../apps/server/src/db.ts";
import { ConversationAgent } from "../apps/server/src/engine/conversation.ts";
import { composioHeaderFor, isComposioUrl } from "../apps/server/src/mcp/composio.ts";
import { OAuthVault, signState, STATE_TTL_MS, StoredOAuthProvider, verifyState } from "../apps/server/src/mcp/oauth.ts";
import { mcpRoutes } from "../apps/server/src/mcp/routes.ts";
import { requestBody, type Resolver } from "../apps/server/src/mcp/safe-fetch.ts";
import { McpService } from "../apps/server/src/mcp/service.ts";
import type { ActionProposal } from "../packages/domain/src/index.ts";
import { modelFixture } from "./helpers/model.ts";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const KEY = randomBytes(32).toString("base64");
const PUBLIC: Resolver = async () => [{ address: "93.184.216.34", family: 4 }];
const MCP_URL = "https://mcp.example.com/mcp";
const AUTH = "https://auth.example.com";
const s256 = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

/**
 * A sign-in service (discovery, registration, token) and an MCP server that wants its tokens.
 * `approve(url)` plays the person signing in on the service's page: it returns the code.
 */
function fakeWorld(options: { keys?: Record<string, string>; s256?: boolean; registration?: boolean } = {}) {
  const seen = {
    registered: [] as Record<string, unknown>[],
    tokenRequests: [] as Record<string, string>[],
    calls: [] as { name: string; args: Record<string, unknown>; auth: string }[],
    mcpAuth: [] as string[],
  };
  const codes = new Map<string, { challenge: string; method: string; client: string; redirect: string }>();
  const access = new Set<string>();
  const refresh = new Set<string>();
  let issued = 0;
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
  const rpc = (id: unknown, result: unknown) => json({ jsonrpc: "2.0", id, result });
  const mint = () => {
    issued++;
    const tokens = { access_token: `at-${issued}-${randomUUID()}`, refresh_token: `rt-${issued}-${randomUUID()}` };
    access.add(tokens.access_token);
    refresh.add(tokens.refresh_token);
    return { ...tokens, token_type: "Bearer", expires_in: 3600 };
  };

  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers);
    // ---- the MCP server's discovery document
    if (url.origin === "https://mcp.example.com" && url.pathname.startsWith("/.well-known/oauth-protected-resource"))
      return json({ resource: MCP_URL, authorization_servers: [AUTH] });
    // ---- the sign-in service
    if (url.origin === AUTH) {
      if (url.pathname === "/.well-known/oauth-authorization-server")
        return json({
          issuer: AUTH,
          authorization_endpoint: `${AUTH}/authorize`,
          token_endpoint: `${AUTH}/token`,
          ...(options.registration === false ? {} : { registration_endpoint: `${AUTH}/register` }),
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: options.s256 === false ? ["plain"] : ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
          scopes_supported: ["openid", "profile", "email", "offline_access"],
        });
      if (url.pathname === "/register" && method === "POST") {
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        seen.registered.push(body);
        return json({ ...body, client_id: "client-abc", client_id_issued_at: 1 }, 201);
      }
      if (url.pathname === "/token" && method === "POST") {
        const form = Object.fromEntries(new URLSearchParams(init?.body as string | URLSearchParams));
        seen.tokenRequests.push(form);
        if (form.grant_type === "authorization_code") {
          const grant = codes.get(form.code ?? "");
          codes.delete(form.code ?? "");
          if (!grant || grant.method !== "S256" || s256(form.code_verifier ?? "") !== grant.challenge || grant.redirect !== form.redirect_uri)
            return json({ error: "invalid_grant" }, 400);
          return json(mint());
        }
        if (form.grant_type === "refresh_token") {
          if (!refresh.delete(form.refresh_token ?? "")) return json({ error: "invalid_grant" }, 400);
          return json(mint());
        }
        return json({ error: "unsupported_grant_type" }, 400);
      }
      return new Response("not here", { status: 404 });
    }
    // ---- the MCP server itself
    if (url.origin === "https://mcp.example.com" || isComposioUrl(url.toString())) {
      if (url.pathname.startsWith("/.well-known/")) return new Response("not here", { status: 404 });
      const bearer = headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
      const keyed = Object.entries(options.keys ?? {}).some(([name, value]) => headers.get(name) === value);
      seen.mcpAuth.push(bearer);
      if (!keyed && !access.has(bearer))
        return new Response("sign in", {
          status: 401,
          headers: {
            "www-authenticate": `Bearer resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"`,
          },
        });
      if (method !== "POST") return new Response(null, { status: 405 });
      const message = JSON.parse(String(init?.body)) as {
        id?: unknown;
        method: string;
        params?: { protocolVersion?: string; name?: string; arguments?: Record<string, unknown> };
      };
      if (message.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (message.method === "initialize")
        return rpc(message.id, {
          protocolVersion: message.params?.protocolVersion,
          capabilities: { tools: {} },
          serverInfo: { name: "fake", version: "1" },
        });
      if (message.method === "tools/list")
        return rpc(message.id, {
          tools: [
            { name: "get_notes", inputSchema: { type: "object" }, annotations: { readOnlyHint: true } },
            { name: "add_note", inputSchema: { type: "object", properties: { text: { type: "string" } } } },
          ],
        });
      if (message.method === "tools/call") {
        seen.calls.push({ name: message.params?.name ?? "", args: message.params?.arguments ?? {}, auth: bearer });
        return rpc(message.id, { content: [{ type: "text", text: "done" }] });
      }
    }
    return new Response("not here", { status: 404 });
  }) as typeof fetch;

  function approve(signInUrl: string) {
    const url = new URL(signInUrl);
    assert.equal(url.origin + url.pathname, `${AUTH}/authorize`);
    const code = `code-${randomUUID()}`;
    codes.set(code, {
      challenge: url.searchParams.get("code_challenge") ?? "",
      method: url.searchParams.get("code_challenge_method") ?? "",
      client: url.searchParams.get("client_id") ?? "",
      redirect: url.searchParams.get("redirect_uri") ?? "",
    });
    return { code, state: url.searchParams.get("state") ?? "" };
  }
  const revokeAll = () => {
    access.clear();
    refresh.clear();
  };
  return { fetcher, seen, approve, access, revokeAll };
}

async function fixture(t: TestContext, world = fakeWorld()) {
  const directory = await mkdtemp(join(tmpdir(), "debo-mcp-oauth-"));
  const db = await createStore();
  const logs: Record<string, unknown>[] = [];
  const clock = { now: Date.parse("2026-11-15T10:00:00Z") };
  const mcp = new McpService(db, {
    encryptionKey: KEY,
    fetcher: world.fetcher,
    resolve: PUBLIC,
    now: () => clock.now,
    log: (entry) => logs.push(entry),
  });
  const config: Config = {
    mode: "sample",
    port: 8787,
    host: "127.0.0.1",
    publicUrl: "http://localhost:8787",
    dataDir: directory,
    agentBackend: "model",
    model: "openai/fixture",
    googleRedirectUri: "http://localhost:8787/api/google/callback",
    allowedOrigins: [],
  };
  const server = await createApp(db, config, { mcp });
  t.after(async () => {
    await server.agent.stop();
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });
  // The signed-in routes, as person A (the real app checks the session first).
  const api = new Hono<{ Variables: { owner: string } }>();
  api.use("*", async (c, next) => {
    c.set("owner", A);
    await next();
  });
  api.onError((error, c) => c.json({ error: error.message }, ((error as { status?: number }).status ?? 500) as 400));
  api.route("/api/mcp", mcpRoutes(mcp));
  api.route("/api/account", accountRoutes(db, server.files, undefined, undefined, mcp));
  return { db, mcp, server, api, logs, world, clock, config };
}

const post = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Adds a sign-in server through the API and finishes the sign-in through the public callback. */
async function signedIn(f: Awaited<ReturnType<typeof fixture>>, name = "Notes") {
  const added = await f.api.request("/api/mcp", post({ name, url: MCP_URL, auth: "sign-in" }));
  assert.equal(added.status, 201, await added.clone().text());
  const body = (await added.json()) as { id: string; signInUrl: string; signedIn: boolean; auth: string };
  assert.equal(body.auth, "sign-in");
  assert.equal(body.signedIn, false);
  const { code, state } = f.world.approve(body.signInUrl);
  const back = await f.server.app.request(
    `/api/mcp/oauth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
  );
  assert.equal(back.status, 200, await back.clone().text());
  assert.match(await back.text(), /You are signed in/);
  return { id: body.id, code, state, signInUrl: body.signInUrl };
}

// ---- the signed state -----------------------------------------------------------------------

test("the sign-in state is signed, runs out after 10 minutes, and can't be changed", () => {
  const key = "k".repeat(43);
  const now = 1_000_000;
  const state = signState({ owner: A, server: "s1", nonce: "n".repeat(24), to: "web" }, key, now);
  assert.deepEqual(verifyState(state, key, now + 1000), { owner: A, server: "s1", nonce: "n".repeat(24), to: "web" });
  assert.equal(verifyState(state, key, now + STATE_TTL_MS + 1), null, "too old");
  assert.equal(verifyState(state, "other-key", now), null, "another key");
  const [body, mac] = state.split(".");
  const forged = Buffer.from(JSON.stringify({ o: B, s: "s1", n: "n".repeat(24), t: "web", e: now + STATE_TTL_MS })).toString("base64url");
  assert.equal(verifyState(`${forged}.${mac}`, key, now), null, "another owner with the old signature");
  assert.equal(verifyState(`${body}.${mac}x`, key, now), null);
  assert.equal(verifyState(`${body}`, key, now), null);
  assert.equal(verifyState("", key, now), null);
  assert.equal(verifyState(`${body}.${mac}.more`, key, now), null);
});

test("the checked fetch sends a form body as text with its length and type", () => {
  const headers: Record<string, string> = {};
  const text = requestBody(new URLSearchParams({ grant_type: "refresh_token", refresh_token: "r" }), headers);
  assert.equal(text, "grant_type=refresh_token&refresh_token=r");
  assert.equal(headers["content-type"], "application/x-www-form-urlencoded;charset=UTF-8");
  assert.equal(headers["content-length"], String(text?.length));
  const kept: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  requestBody(new URLSearchParams({ a: "1" }), kept);
  assert.equal(kept["content-type"], "application/x-www-form-urlencoded");
  assert.equal(requestBody(undefined, {}), undefined);
  assert.throws(() => requestBody(new Blob(["x"]), {}), /form it does not support/);
});

// ---- signing in -----------------------------------------------------------------------------

test("sign-in: Daksha registers itself, uses PKCE S256, keeps the tokens encrypted and lists the tools", async (t) => {
  const f = await fixture(t);
  const { id, signInUrl } = await signedIn(f);
  const page = new URL(signInUrl);
  assert.equal(page.searchParams.get("code_challenge_method"), "S256");
  assert.equal(page.searchParams.get("client_id"), "client-abc");
  assert.equal(page.searchParams.get("redirect_uri"), "http://localhost:8787/api/mcp/oauth/callback");
  assert.equal(page.searchParams.get("resource"), MCP_URL);
  // No scopes on the server's document, so only what keeps a sign-in going.
  assert.equal(page.searchParams.get("scope"), "openid offline_access");
  assert.equal(f.world.seen.registered.length, 1);
  assert.equal(f.world.seen.registered[0]?.client_name, "Daksha");
  assert.equal(f.world.seen.registered[0]?.token_endpoint_auth_method, "none");
  // The code was swapped with the verifier whose S256 matches the challenge (the fake checks it).
  const exchange = f.world.seen.tokenRequests.find((r) => r.grant_type === "authorization_code");
  assert.ok(exchange?.code_verifier && s256(exchange.code_verifier) === page.searchParams.get("code_challenge"));
  const listed = (await (await f.api.request("/api/mcp")).json()) as { servers: { id: string; signedIn: boolean; tools: unknown[] }[] };
  assert.equal(listed.servers[0]?.signedIn, true);
  assert.equal(listed.servers[0]?.tools.length, 2);
  // Tokens are nowhere the app, the export or the logs can see, and stored only encrypted.
  const issued = f.world.seen.tokenRequests.length;
  assert.equal(issued, 1);
  const secrets = [...f.world.access, exchange.code_verifier, exchange.code ?? ""];
  const visible = [
    await (await f.api.request("/api/mcp")).text(),
    JSON.stringify(await (await f.api.request("/api/account/export")).json()),
    JSON.stringify(f.logs),
    JSON.stringify(await f.db.listOwner(A)),
  ];
  for (const text of visible) for (const secret of secrets) assert.ok(!text.includes(secret), "a token leaked");
  assert.ok(!visible[0]?.includes("client-abc") && !visible[1]?.includes("client-abc"));
  assert.ok(!visible[2]?.includes("rt-") && !visible[2]?.includes("at-1"));
  // Another person can't use, refresh or sign out of it.
  await assert.rejects(f.mcp.refresh(B, id), /couldn't find/);
  await assert.rejects(f.mcp.signOut(B, id), /couldn't find/);
  await assert.rejects(f.mcp.startSignIn(B, id, "web"), /couldn't find/);
});

test("a state works once, a wrong or changed state stores nothing, and a cancelled sign-in fails", async (t) => {
  const f = await fixture(t);
  const { code, state, id } = await signedIn(f);
  const tokensBefore = f.world.seen.tokenRequests.length;
  // Replayed: refused before any token request.
  const again = await f.server.app.request(`/api/mcp/oauth/callback?code=${code}&state=${encodeURIComponent(state)}`);
  assert.equal(again.status, 400);
  assert.match(await again.text(), /did not finish/);
  assert.equal(f.world.seen.tokenRequests.length, tokensBefore);
  // Changed state, missing code, error from the service, nonsense.
  for (const query of [
    `code=x&state=${encodeURIComponent(`${state}x`)}`,
    `state=${encodeURIComponent(state)}`,
    `error=access_denied&state=${encodeURIComponent(state)}`,
    `code=<script>&state=<script>`,
    "",
  ]) {
    const res = await f.server.app.request(`/api/mcp/oauth/callback?${query}`);
    assert.equal(res.status, 400, query);
    const html = await res.text();
    assert.ok(!html.includes("<script>"), "nothing from the request is shown");
    assert.match(res.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  }
  assert.equal(f.world.seen.tokenRequests.length, tokensBefore);
  // A new sign-in makes the old link useless even within its 10 minutes.
  const first = await f.mcp.startSignIn(A, id, "native");
  const second = await f.mcp.startSignIn(A, id, "native");
  const old = f.world.approve(first.url);
  const res = await f.server.app.request(`/api/mcp/oauth/callback?code=${old.code}&state=${encodeURIComponent(old.state)}`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("location"), "debo://tool-servers?status=failed");
  const fresh = f.world.approve(second.url);
  const ok = await f.server.app.request(`/api/mcp/oauth/callback?code=${fresh.code}&state=${encodeURIComponent(fresh.state)}`);
  assert.equal(ok.headers.get("location"), "debo://tool-servers?status=success");
});

test("an expired state is refused even with the right nonce", async (t) => {
  const f = await fixture(t);
  const added = (await (await f.api.request("/api/mcp", post({ name: "Late", url: MCP_URL, auth: "sign-in" }))).json()) as {
    signInUrl: string;
  };
  const { code, state } = f.world.approve(added.signInUrl);
  f.clock.now += STATE_TTL_MS + 1000;
  const res = await f.server.app.request(`/api/mcp/oauth/callback?code=${code}&state=${encodeURIComponent(state)}`);
  assert.equal(res.status, 400);
  assert.equal((await f.mcp.list(A))[0]?.signedIn, false);
});

test("a server whose sign-in lacks S256 or registration is refused and not kept", async (t) => {
  for (const world of [fakeWorld({ s256: false }), fakeWorld({ registration: false })]) {
    const f = await fixture(t, world);
    const res = await f.api.request("/api/mcp", post({ name: "Odd", url: MCP_URL, auth: "sign-in" }));
    assert.equal(res.status, 400);
    assert.match(((await res.json()) as { error: string }).error, /sign-in|registered/);
    assert.deepEqual(await f.mcp.list(A), []);
    assert.equal((await f.db.listOwner(A)).length, 0);
  }
  const f = await fixture(t);
  await assert.rejects(
    f.mcp.add(A, { name: "Both", url: MCP_URL, auth: "sign-in", secret: "x" }),
    /either Sign in or a secret/,
  );
});

// ---- staying signed in ----------------------------------------------------------------------

test("a token about to run out is refreshed first, a refused one is refreshed on 401, and a dead one asks to sign in again", async (t) => {
  const f = await fixture(t);
  const { id } = await signedIn(f);
  const grants = () => f.world.seen.tokenRequests.filter((r) => r.grant_type === "refresh_token").length;
  // 59 minutes and 30 seconds later: inside the last minute, so it is refreshed before the call.
  f.clock.now += 3600_000 - 30_000;
  await f.mcp.refresh(A, id);
  assert.equal(grants(), 1);
  // The server stops taking the access token early: the SDK refreshes on the 401 and retries.
  f.world.access.clear();
  await f.mcp.refresh(A, id);
  assert.equal(grants(), 2);
  assert.equal((await f.mcp.list(A))[0]?.lastOk, true);
  // Everything revoked: the refresh is refused, and the person is asked to sign in again.
  f.world.revokeAll();
  await assert.rejects(f.mcp.refresh(A, id), /Sign in again/);
  const row = (await f.mcp.list(A))[0];
  assert.equal(row?.signedIn, false);
  assert.match(row?.lastMessage ?? "", /Sign in again/);
  // Signed out now: nothing is sent until the person signs in again.
  const before = f.world.seen.mcpAuth.length;
  await assert.rejects(f.mcp.refresh(A, id), /Sign in again/);
  assert.equal(f.world.seen.mcpAuth.length, before);
  // Sign in again through the route, and it works.
  const again = (await (await f.api.request(`/api/mcp/${id}/sign-in`, post({ to: "web" }))).json()) as { url: string };
  const { code, state } = f.world.approve(again.url);
  const back = await f.server.app.request(`/api/mcp/oauth/callback?code=${code}&state=${encodeURIComponent(state)}`);
  assert.equal(back.status, 200);
  assert.equal((await f.mcp.list(A))[0]?.signedIn, true);
});

test("sign out deletes the tokens and keeps the server; remove deletes both", async (t) => {
  const f = await fixture(t);
  const { id } = await signedIn(f);
  const creds = async () => (await f.db.listOwner(A)).filter((r) => r.kind === "credentials").length;
  assert.equal(await creds(), 1);
  const out = await f.api.request(`/api/mcp/${id}/sign-in`, { method: "DELETE" });
  assert.equal(out.status, 200);
  assert.equal(((await out.json()) as { signedIn: boolean }).signedIn, false);
  assert.equal(await creds(), 0);
  await assert.rejects(f.mcp.refresh(A, id), /Sign in again/);
  const { id: other } = await signedIn(f, "Second");
  assert.equal(await creds(), 1);
  assert.equal((await f.api.request(`/api/mcp/${other}`, { method: "DELETE" })).status, 200);
  assert.equal(await creds(), 0);
});

// ---- writes still wait for a yes --------------------------------------------------------------

test("a signed-in server's change waits for the person's yes, then runs once with the bearer token", async (t) => {
  const f = await fixture(t);
  await signedIn(f);
  await modelFixture(t, (i) =>
    i === 0
      ? { name: "use_server_tool", arguments: { server: "Notes", tool: "add_note", arguments: { text: "milk" } } }
      : undefined,
  );
  const input: RunAgentInput = {
    threadId: `thread-${randomUUID()}`,
    runId: randomUUID(),
    messages: [{ id: randomUUID(), role: "user", content: "add milk" }],
    tools: [],
    context: [],
    state: {},
  };
  const chat = new ConversationAgent(f.config, f.server.agent, A);
  const events = await lastValueFrom(chat.run(input).pipe(toArray()));
  const out = events
    .filter((e) => e.type === EventType.TOOL_CALL_RESULT)
    .map((e) => JSON.parse((e as unknown as { content: string }).content) as { status: string; actionId: string });
  assert.equal(out[0]?.status, "awaiting_review");
  assert.equal(f.world.seen.calls.length, 0);
  const proposal = (await f.db.get<ActionProposal>(A, "actions", out[0]?.actionId ?? "")) as ActionProposal;
  const done = await f.server.actions.decide(A, proposal.id, proposal.hash, "approve");
  assert.equal(done.status, "succeeded", done.error);
  assert.equal(f.world.seen.calls.length, 1);
  assert.deepEqual(f.world.seen.calls[0]?.args, { text: "milk" });
  assert.ok(f.world.access.has(f.world.seen.calls[0]?.auth ?? ""), "sent with the signed-in token");
});

// ---- bring your own Composio ------------------------------------------------------------------

test("Composio: the address must be Composio's, and the key goes in Composio's own header", async (t) => {
  assert.equal(isComposioUrl("https://connect.composio.dev/mcp"), true);
  assert.equal(isComposioUrl("https://backend.composio.dev/v3/mcp/abc?user_id=me"), true);
  assert.equal(isComposioUrl("https://composio.dev.evil.example/mcp"), false);
  assert.equal(isComposioUrl("https://evilcomposio.dev/mcp"), false);
  assert.equal(composioHeaderFor("https://connect.composio.dev/mcp"), "x-consumer-api-key");
  assert.equal(composioHeaderFor("https://backend.composio.dev/v3/mcp/abc"), "x-api-key");
  const f = await fixture(
    t,
    fakeWorld({ keys: { "x-consumer-api-key": "ck_mine", "x-api-key": "pk_project" } }),
  );
  await assert.rejects(
    f.mcp.add(A, { name: "Fake", url: MCP_URL, secret: "ck_mine", preset: "composio" }),
    /not a Composio address/,
  );
  const res = await f.api.request(
    "/api/mcp",
    post({ name: "Composio", url: "https://connect.composio.dev/mcp", secret: "ck_mine", preset: "composio" }),
  );
  assert.equal(res.status, 201);
  const body = (await res.json()) as { headerName: string; preset: string; auth: string; tools: unknown[] };
  assert.equal(body.headerName, "x-consumer-api-key");
  assert.equal(body.preset, "composio");
  assert.equal(body.auth, "key");
  assert.equal(body.tools.length, 2);
  const project = await f.mcp.add(A, {
    name: "Project",
    url: "https://backend.composio.dev/v3/mcp/abc?user_id=me",
    secret: "pk_project",
    preset: "composio",
  });
  assert.equal(project.headerName, "x-api-key");
  const everything = [await (await f.api.request("/api/mcp")).text(), JSON.stringify(f.logs), JSON.stringify(await f.db.listOwner(A))];
  for (const text of everything) assert.ok(!text.includes("ck_mine") && !text.includes("pk_project"));
});

test("a client registered for an old callback address registers again at the next sign-in, and keeps refreshing until then", async () => {
  const db = await createStore();
  const vault = new OAuthVault(db, KEY, A, "server-1");
  const oldCallback = "https://api.old.example/api/mcp/oauth/callback";
  const newCallback = "https://api.new.example/api/mcp/oauth/callback";
  const now = () => Date.parse("2026-11-19T10:00:00Z");
  const open = async (state?: string) => StoredOAuthProvider.open(vault, { redirectUrl: newCallback, now, ...(state ? { state } : {}) });
  await vault.save({ client: { client_id: "old-client", redirect_uris: [oldCallback] } });
  // Refreshing a token (no sign-in in progress) keeps the client that owns the tokens.
  assert.equal((await open()).clientInformation()?.client_id, "old-client");
  // A new sign-in leaves it out, so the SDK registers a client for the new address.
  assert.equal((await open("s")).clientInformation(), undefined);
  // A client registered for this address, or one with no addresses on record, is kept.
  await vault.save({ client: { client_id: "new-client", redirect_uris: [newCallback] } });
  assert.equal((await open("s")).clientInformation()?.client_id, "new-client");
  await vault.save({ client: { client_id: "manual" } });
  assert.equal((await open("s")).clientInformation()?.client_id, "manual");
  await db.close();
});
