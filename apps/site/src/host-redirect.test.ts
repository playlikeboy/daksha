import { expect, test } from "vitest";
import { siteRedirect } from "./host-redirect";

test("about.daksha.life and about.debo.life send pages to www.daksha.life with path and query", () => {
  expect(siteRedirect("https://about.daksha.life/")).toBe("https://www.daksha.life/");
  expect(siteRedirect("https://about.debo.life/")).toBe("https://www.daksha.life/");
  expect(siteRedirect("https://about.debo.life/?utm_source=x#film")).toBe("https://www.daksha.life/?utm_source=x");
  expect(siteRedirect("https://about.debo.life/sitemap.xml")).toBe("https://www.daksha.life/sitemap.xml");
  expect(siteRedirect("https://about.daksha.life/a/b?c=1&d=2")).toBe("https://www.daksha.life/a/b?c=1&d=2");
});

test("www.daksha.life and preview addresses are served", () => {
  expect(siteRedirect("https://www.daksha.life/")).toBeNull();
  expect(siteRedirect("https://www.daksha.life/robots.txt")).toBeNull();
  expect(siteRedirect("https://debo-site.example.workers.dev/")).toBeNull();
  expect(siteRedirect("http://localhost:3000/")).toBeNull();
});

test("the Host header wins, and case and port do not matter", () => {
  expect(siteRedirect("http://localhost:3000/x", "About.Debo.Life:443")).toBe("https://www.daksha.life/x");
  expect(siteRedirect("not a url")).toBeNull();
});

test("the films' old debo-* names send to the daksha-* files, in one hop from an old host", () => {
  expect(siteRedirect("https://www.daksha.life/debo-launch.mp4")).toBe("https://www.daksha.life/daksha-launch.mp4");
  expect(siteRedirect("https://www.daksha.life/debo-demo.mp4?t=3")).toBe("https://www.daksha.life/daksha-demo.mp4?t=3");
  expect(siteRedirect("https://www.daksha.life/debo-launch-poster.webp")).toBe(
    "https://www.daksha.life/daksha-launch-poster.webp",
  );
  expect(siteRedirect("https://www.daksha.life/debo-demo.en.vtt")).toBe("https://www.daksha.life/daksha-demo.en.vtt");
  expect(siteRedirect("https://about.debo.life/debo-launch-vertical.mp4")).toBe(
    "https://www.daksha.life/daksha-launch-vertical.mp4",
  );
  expect(siteRedirect("http://localhost:3000/debo-demo.webm")).toBe("http://localhost:3000/daksha-demo.webm");
});

test("other files, and the films' new names, are served", () => {
  expect(siteRedirect("https://www.daksha.life/daksha-launch.mp4")).toBeNull();
  expect(siteRedirect("https://www.daksha.life/debo.svg")).toBeNull();
  expect(siteRedirect("https://www.daksha.life/debo-other.mp4")).toBeNull();
});
