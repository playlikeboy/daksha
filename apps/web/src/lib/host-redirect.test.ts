import { expect, test } from "vitest";
import { webRedirect } from "./host-redirect";

const go = (url: string) => webRedirect(url);

test("daksha.life sends pages to the landing page at www.daksha.life, keeping path and query", () => {
  expect(go("https://daksha.life/")).toBe("https://www.daksha.life/");
  expect(go("https://daksha.life/?ref=mail")).toBe("https://www.daksha.life/?ref=mail");
  expect(go("https://daksha.life/how-it-works?a=1&b=2")).toBe("https://www.daksha.life/how-it-works?a=1&b=2");
});

test("daksha.life keeps serving the privacy page, /api/* and files", () => {
  expect(go("https://daksha.life/privacy")).toBeNull();
  expect(go("https://daksha.life/privacy/")).toBeNull();
  expect(go("https://daksha.life/api/neon-auth/webhook")).toBeNull();
  expect(go("https://daksha.life/api/export?x=1")).toBeNull();
  expect(go("https://daksha.life/api")).toBeNull();
  expect(go("https://daksha.life/robots.txt")).toBeNull();
  expect(go("https://daksha.life/sitemap.xml")).toBeNull();
  expect(go("https://daksha.life/manifest.webmanifest")).toBeNull();
  expect(go("https://daksha.life/_next/static/chunks/a.js")).toBeNull();
});

test("the old signed-in screens go to the app", () => {
  expect(go("https://daksha.life/home")).toBe("https://my.daksha.life/chat");
  expect(go("https://daksha.life/home/journal/")).toBe("https://my.daksha.life/journal");
  expect(go("https://daksha.life/home/memories")).toBe("https://my.daksha.life/knows");
  expect(go("https://daksha.life/home/unknown")).toBe("https://my.daksha.life/");
  expect(go("https://daksha.life/auth/sign-in")).toBe("https://my.daksha.life");
});

test("debo.life and www.debo.life send pages to the same path on daksha.life, in one hop", () => {
  expect(go("https://debo.life/privacy")).toBe("https://daksha.life/privacy");
  expect(go("https://debo.life/privacy?lang=en")).toBe("https://daksha.life/privacy?lang=en");
  expect(go("https://www.debo.life/privacy")).toBe("https://daksha.life/privacy");
  expect(go("https://debo.life/robots.txt")).toBe("https://daksha.life/robots.txt");
  // Pages daksha.life would move again go straight to their last stop.
  expect(go("https://debo.life/")).toBe("https://www.daksha.life/");
  expect(go("https://www.debo.life/about?x=1")).toBe("https://www.daksha.life/about?x=1");
  expect(go("https://debo.life/home/voice")).toBe("https://my.daksha.life/talk");
});

test("debo.life never moves /api/*, so old webhook addresses keep working", () => {
  expect(go("https://debo.life/api/neon-auth/webhook")).toBeNull();
  expect(go("https://www.debo.life/api/voice/token?x=1")).toBeNull();
});

test("the Host header wins over the URL, and case and port do not matter", () => {
  expect(webRedirect("http://localhost:3000/privacy", "DEBO.LIFE")).toBe("https://daksha.life/privacy");
  expect(webRedirect("https://debo-web.example.workers.dev/privacy", "www.debo.life:443")).toBe(
    "https://daksha.life/privacy",
  );
});

test("www.daksha.life is never sent back to itself", () => {
  expect(go("https://www.daksha.life/")).toBeNull();
  expect(go("https://www.daksha.life/privacy")).toBeNull();
});

test("a broken address is served, not moved", () => {
  expect(webRedirect("not a url")).toBeNull();
});
