import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import { createApp } from "../apps/server/src/app.ts";
import type { Config } from "../apps/server/src/config.ts";
import { createStore, type Store } from "../apps/server/src/db.ts";
import { publicUrlFor, readPublicUrlAliases } from "../apps/server/src/public-address.ts";

// The API answers on api.debo.life and on its twin api.daksha.life (docs/DOMAINS.md).
const MAIN = "https://api.debo.life";
const TWIN = "https://api.daksha.life";

describe("reading PUBLIC_API_URL_ALIASES", () => {
  test("keeps each address's origin and skips blanks and junk", () => {
    assert.deepEqual(readPublicUrlAliases(undefined), []);
    assert.deepEqual(readPublicUrlAliases(""), []);
    assert.deepEqual(
      readPublicUrlAliases(" https://api.daksha.life/ , ,not an address,ftp://x.test,http://127.0.0.1:8787"),
      [TWIN, "http://127.0.0.1:8787"],
    );
  });
});

describe("choosing the public address for a request", () => {
  const config = { publicUrl: `${MAIN}/`, publicUrlAliases: [TWIN] };
  test("a request on the twin gets the twin", () => {
    assert.equal(publicUrlFor(config, "http://api.daksha.life/api/health"), TWIN);
    assert.equal(publicUrlFor(config, "https://API.DAKSHA.LIFE/api/health"), TWIN);
  });
  test("a request on the main address, or any other host, gets PUBLIC_API_URL", () => {
    assert.equal(publicUrlFor(config, "http://api.debo.life/api/health"), MAIN);
    assert.equal(publicUrlFor(config, "http://evil.example.test/api/health"), MAIN);
    assert.equal(publicUrlFor(config, "http://localhost:8787/api/health"), MAIN);
    assert.equal(publicUrlFor({ publicUrl: MAIN }, "http://api.daksha.life/api/health"), MAIN);
  });
});

describe("the API on two addresses", () => {
  let directory: string, db: Store, server: Awaited<ReturnType<typeof createApp>>;
  before(async () => {
    directory = await mkdtemp(join(tmpdir(), "debo-public-address-"));
    db = await createStore({ dataDir: join(directory, "db"), schema: "os" });
    const config: Config = {
      mode: "sample",
      port: 8787,
      host: "127.0.0.1",
      publicUrl: MAIN,
      publicUrlAliases: [TWIN],
      dataDir: directory,
      agentBackend: "sample",
      googleRedirectUri: `${MAIN}/api/google/callback`,
      // my.debo.life first: the API uses the first https origin as the app's own address.
      allowedOrigins: ["https://my.debo.life", "https://my.daksha.life"],
      authMode: "neon",
      neonAuthBaseUrl: "https://auth.example.test/neondb/auth",
      neonAuthJwksUrl: "https://auth.example.test/neondb/auth/.well-known/jwks.json",
      dbSchema: "os",
    };
    server = await createApp(db, config, {
      neonAuthFetch: async (input, init) => {
        // Echo the Origin Neon Auth would see, so the test can check it.
        const origin = new Headers(init?.headers).get("origin") ?? "";
        return Response.json({ url: String(input), origin });
      },
    });
  });
  after(async () => {
    await db.close();
    await rm(directory, { recursive: true, force: true });
  });

  const health = async (url: string) => (await (await server.app.request(url)).json()).auth;

  test("each address hands out sign-in on itself, so the cookie stays same-site", async () => {
    assert.deepEqual(await health("http://api.debo.life/api/health"), {
      mode: "neon",
      neonAuthUrl: `${MAIN}/api/neon-auth`,
    });
    assert.deepEqual(await health("http://api.daksha.life/api/health"), {
      mode: "neon",
      neonAuthUrl: `${TWIN}/api/neon-auth`,
    });
    assert.equal((await health("http://other.example.test/api/health")).neonAuthUrl, `${MAIN}/api/neon-auth`);
  });

  test("both apps may call it, and an unknown site may not", async () => {
    for (const origin of ["https://my.debo.life", "https://my.daksha.life"]) {
      const response = await server.app.request("http://api.daksha.life/api/health", { headers: { origin } });
      assert.equal(response.status, 200, origin);
      assert.equal(response.headers.get("access-control-allow-origin"), origin);
    }
    const refused = await server.app.request("http://api.debo.life/api/health", {
      headers: { origin: "https://my.example.test" },
    });
    assert.equal(refused.status, 403);
  });

  test("phone sign-in still sends my.debo.life as its Origin on either address", async () => {
    for (const url of ["http://api.debo.life/api/neon-auth/get-session", "http://api.daksha.life/api/neon-auth/get-session"]) {
      const body = await (await server.app.request(url)).json();
      assert.equal(body.origin, "https://my.debo.life", url);
    }
  });

  test("the app's sign-in on the twin passes its own Origin through", async () => {
    const response = await server.app.request("http://api.daksha.life/api/neon-auth/get-session", {
      headers: { origin: "https://my.daksha.life", "sec-fetch-site": "same-site" },
    });
    assert.equal((await response.json()).origin, "https://my.daksha.life");
  });
});
