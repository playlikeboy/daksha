// The app Worker's redirect: my.debo.life, the address from before the rename, answers every
// request with a 307 to the same path and query on my.daksha.life (docs/DOMAINS.md).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import worker from "../infra/cloudflare/app/src/index.ts";
import { appRedirect } from "../infra/cloudflare/app/src/redirect.ts";

describe("appRedirect", () => {
  test("my.debo.life moves to my.daksha.life with path and query", () => {
    assert.equal(appRedirect("https://my.debo.life/"), "https://my.daksha.life/");
    assert.equal(appRedirect("https://my.debo.life/journal?x=1&y=2"), "https://my.daksha.life/journal?x=1&y=2");
    assert.equal(appRedirect("https://MY.DEBO.LIFE/chat"), "https://my.daksha.life/chat");
    // Files move too, so a link to a picture or a film on the old address still works.
    assert.equal(appRedirect("https://my.debo.life/og.png?v=3"), "https://my.daksha.life/og.png?v=3");
  });

  test("my.daksha.life and preview addresses are served", () => {
    assert.equal(appRedirect("https://my.daksha.life/journal"), null);
    assert.equal(appRedirect("https://debo-os-app.example.workers.dev/"), null);
    assert.equal(appRedirect("http://localhost:8081/"), null);
    assert.equal(appRedirect("not a url"), null);
  });

  test("other old hosts are not this Worker's job", () => {
    assert.equal(appRedirect("https://api.debo.life/api/health"), null);
    assert.equal(appRedirect("https://debo.life/privacy"), null);
  });
});

describe("the app Worker", () => {
  const served: string[] = [];
  const env = {
    ASSETS: {
      fetch: async (request: Request) => {
        served.push(request.url);
        return new Response("app", { status: 200 });
      },
    },
  };
  const ctx = undefined;

  test("answers my.debo.life with a 307 and does not touch the files", async () => {
    served.length = 0;
    const response = await worker.fetch(new Request("https://my.debo.life/knows?tab=people"), env, ctx);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://my.daksha.life/knows?tab=people");
    assert.deepEqual(served, []);
  });

  test("keeps the method for a 307, so a range request is just sent again", async () => {
    const request = new Request("https://my.debo.life/clip.mp4", { headers: { Range: "bytes=0-99" } });
    const response = await worker.fetch(request, env, ctx);
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), "https://my.daksha.life/clip.mp4");
  });

  test("hands my.daksha.life to the files", async () => {
    served.length = 0;
    const response = await worker.fetch(new Request("https://my.daksha.life/journal"), env, ctx);
    assert.equal(response.status, 200);
    assert.deepEqual(served, ["https://my.daksha.life/journal"]);
  });
});
