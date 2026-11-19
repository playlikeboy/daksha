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
