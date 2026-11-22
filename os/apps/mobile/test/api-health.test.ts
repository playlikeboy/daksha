import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  apiCandidates,
  authAfterProbe,
  DEFAULT_WAITS,
  expectsNeonSignIn,
  findApi,
} from "../src/api-health.ts";

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAIN = "https://api.daksha.life";
const BACKUP = "https://api.debo.life";
const neonBody = (base: string) => ({ ok: true, auth: { mode: "neon", neonAuthUrl: `${base}/api/neon-auth` } });

/** A fake fetch: `answers` says, per address, what each call in turn does. */
function fakeFetch(answers: Record<string, Array<"fail" | "html" | "500" | object>>) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    const base = url.replace(/\/api\/health$/, "");
    const next = answers[base]?.shift() ?? "fail";
    if (next === "fail") throw new TypeError("Failed to fetch");
    if (next === "500") return new Response("busy", { status: 500 });
    if (next === "html") return new Response("<html>captive portal</html>", { status: 200 });
    return Response.json(next);
  }) as typeof fetch;
  return { impl, calls };
}

const noSleep = { waits: DEFAULT_WAITS, sleep: async () => {} };

test("the main address is used when it answers first time", async () => {
  const { impl, calls } = fakeFetch({ [MAIN]: [neonBody(MAIN)] });
  const found = await findApi([MAIN, BACKUP], true, { ...noSleep, fetchImpl: impl });
  assert.deepEqual(found, { base: MAIN, auth: { mode: "neon", neonAuthUrl: `${MAIN}/api/neon-auth` } });
  assert.deepEqual(calls, [`${MAIN}/api/health`]);
});

test("the fallback is used when the main address fails, and gives its own sign-in address", async () => {
  const { impl } = fakeFetch({ [MAIN]: ["fail"], [BACKUP]: [neonBody(BACKUP)] });
  const found = await findApi([MAIN, BACKUP], true, { ...noSleep, fetchImpl: impl });
  assert.equal(found?.base, BACKUP);
  assert.deepEqual(found?.auth, { mode: "neon", neonAuthUrl: `${BACKUP}/api/neon-auth` });
});

test("it waits and tries again: 4 rounds, about 7 seconds of waiting", async () => {
  const waited: number[] = [];
  const { impl, calls } = fakeFetch({ [MAIN]: ["fail", "500", "html", neonBody(MAIN)], [BACKUP]: [] });
  const found = await findApi([MAIN, BACKUP], true, {
    fetchImpl: impl,
    sleep: async (ms) => void waited.push(ms),
  });
  assert.equal(found?.base, MAIN);
  assert.deepEqual(waited, [1_000, 2_000, 4_000]);
  assert.equal(calls.length, 7); // main and backup in rounds 1 to 3, then main answers
});

test("nothing answers: a Neon build says it can't reach Daksha, a local install keeps the access key", async () => {
  const { impl, calls } = fakeFetch({});
  const found = await findApi([MAIN, BACKUP], true, { ...noSleep, fetchImpl: impl });
  assert.equal(found, undefined);
  assert.equal(calls.length, 8);
  assert.deepEqual(authAfterProbe(found, true), { mode: "unreachable" });
  assert.deepEqual(authAfterProbe(found, false), { mode: "access-key" });
});

test("a Neon build does not take an access-key answer; a local install does", async () => {
  const local = "http://localhost:8787";
  const accessKey = { ok: true, auth: { mode: "access-key" } };
  const neonRun = fakeFetch({ [local]: [accessKey, accessKey, accessKey, accessKey] });
  assert.equal(await findApi([local], true, { ...noSleep, fetchImpl: neonRun.impl }), undefined);
  const localRun = fakeFetch({ [local]: [accessKey] });
  assert.deepEqual(await findApi([local], false, { ...noSleep, fetchImpl: localRun.impl }), {
    base: local,
    auth: { mode: "access-key" },
  });
});

test("a request that hangs counts as failed after the timeout", async () => {
  const hang = (async (_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    })) as typeof fetch;
  const found = await findApi([MAIN], true, { fetchImpl: hang, waits: [], timeoutMs: 20 });
  assert.equal(found, undefined);
});

test("candidates drop repeats, blanks and trailing slashes", () => {
  assert.deepEqual(apiCandidates(`${MAIN}/`, `${BACKUP}/`), [MAIN, BACKUP]);
  assert.deepEqual(apiCandidates(MAIN, MAIN), [MAIN]);
  assert.deepEqual(apiCandidates(MAIN, undefined), [MAIN]);
  assert.deepEqual(apiCandidates(MAIN, " "), [MAIN]);
});

test("a Neon build is known by its flag or by the live site's name", () => {
  assert.equal(expectsNeonSignIn("neon", undefined), true);
  assert.equal(expectsNeonSignIn(undefined, "my.daksha.life"), true);
  assert.equal(expectsNeonSignIn(undefined, "my.debo.life"), true);
  assert.equal(expectsNeonSignIn("", "localhost:8081"), false);
  assert.equal(expectsNeonSignIn(undefined, undefined), false);
  assert.equal(expectsNeonSignIn(undefined, "debo-os-app.example.workers.dev"), false);
  assert.equal(expectsNeonSignIn(undefined, "notdaksha.life"), false);
});

test("the deploy workflows build the app for Neon sign-in with a fallback address", () => {
  const read = (name: string) => readFileSync(path.join(mobile, "../../../.github/workflows", name), "utf8");
  const web = read("deploy-os.yml");
  assert.match(web, /EXPO_PUBLIC_AUTH_MODE: neon/);
  assert.match(web, /EXPO_PUBLIC_API_URL_FALLBACK: \$\{\{ steps\.urls\.outputs\.callback_api \}\}/);
  assert.match(web, /callback_api=https:\/\/api\.debo\.life/);
  const phone = read("release-mobile.yml");
  assert.match(phone, /EXPO_PUBLIC_AUTH_MODE: neon/);
  assert.match(phone, /EXPO_PUBLIC_API_URL_FALLBACK: https:\/\/api\.debo\.life/);
});

test("the app reads the flag and the fallback from the build", () => {
  const source = readFileSync(path.join(mobile, "src/api.ts"), "utf8");
  // Expo only bakes in process.env.EXPO_PUBLIC_* when written out in full like this.
  assert.match(source, /process\.env\.EXPO_PUBLIC_API_URL_FALLBACK/);
  assert.match(source, /process\.env\.EXPO_PUBLIC_AUTH_MODE/);
});
