import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { Hono } from "hono";
import { neonAuthProxy } from "../apps/server/src/neon-auth-proxy.ts";

const BASE = "https://auth.example.test/neondb/auth";

function setup(answer: (request: Request) => Response) {
  const seen: Request[] = [];
  const fake = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input as string, init);
    seen.push(request);
    return answer(request);
  }) as typeof fetch;
  const app = new Hono();
  app.route("/api/neon-auth", neonAuthProxy(BASE, fake));
  return { app, seen };
}

describe("sign-in pass-through to Neon Auth", () => {
  test("passes sign-in on and hands back the cookie and the JWT header", async () => {
    const { app, seen } = setup(() => {
      const headers = new Headers({ "content-type": "application/json", "set-auth-jwt": "jwt-value", "x-internal": "hidden" });
      headers.append("set-cookie", "a=1; Path=/; HttpOnly; Secure; SameSite=None; Partitioned");
      headers.append("set-cookie", "b=2; Path=/; HttpOnly; Secure");
      return new Response(JSON.stringify({ token: "t" }), { status: 200, headers });
    });
    const response = await app.request("/api/neon-auth/sign-in/email?x=1", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://my.debo.life", cookie: "old=1", "x-secret": "no" },
      body: JSON.stringify({ email: "a@example.test", password: "pw" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { token: "t" });
    assert.equal(response.headers.get("set-auth-jwt"), "jwt-value");
    assert.equal(response.headers.get("x-internal"), null);
    assert.equal(response.headers.getSetCookie().length, 2);
    const sent = seen[0] as Request;
    assert.equal(sent.url, `${BASE}/sign-in/email?x=1`);
    assert.equal(sent.method, "POST");
    assert.equal(sent.headers.get("origin"), "https://my.debo.life");
    assert.equal(sent.headers.get("cookie"), "old=1");
    assert.equal(sent.headers.get("x-secret"), null);
    assert.deepEqual(await sent.json(), { email: "a@example.test", password: "pw" });
  });

  test("keeps Neon Auth's own status, such as 401", async () => {
    const { app } = setup(() => new Response("{}", { status: 401 }));
    assert.equal((await app.request("/api/neon-auth/token")).status, 401);
  });

  test("refuses paths that try to leave the sign-in folder", async () => {
    const { app, seen } = setup(() => new Response("{}"));
    for (const path of ["/api/neon-auth/..%2Fadmin", "/api/neon-auth/a/../../b", "/api/neon-auth/.well-known/x", "/api/neon-auth/"])
      assert.equal((await app.request(path)).status, 404, path);
    assert.equal(seen.length, 0);
  });

  test("says so plainly when Neon Auth cannot be reached", async () => {
    const { app } = setup(() => {
      throw new Error("down");
    });
    assert.equal((await app.request("/api/neon-auth/get-session")).status, 502);
  });
});
