import assert from "node:assert/strict";
import test from "node:test";
import { apiUrlForPage } from "../src/api-address.ts";

test("the app on my.daksha.life talks to api.daksha.life", () => {
  assert.equal(apiUrlForPage("https://api.debo.life", "my.daksha.life"), "https://api.daksha.life");
  assert.equal(apiUrlForPage("https://api.debo.life/", "MY.DAKSHA.LIFE"), "https://api.daksha.life");
});

test("the app on my.debo.life keeps api.debo.life", () => {
  assert.equal(apiUrlForPage("https://api.debo.life", "my.debo.life"), "https://api.debo.life");
  assert.equal(apiUrlForPage("https://api.debo.life/", "my.debo.life"), "https://api.debo.life");
});

test("a build made for daksha.life, opened on my.debo.life, swaps back", () => {
  assert.equal(apiUrlForPage("https://api.daksha.life", "my.debo.life"), "https://api.debo.life");
});

test("phones, local runs, previews and other sites keep the built-in address", () => {
  assert.equal(apiUrlForPage("https://api.debo.life", undefined), "https://api.debo.life");
  assert.equal(apiUrlForPage("http://localhost:8787", "localhost:8081"), "http://localhost:8787");
  assert.equal(apiUrlForPage("http://localhost:8787", "my.daksha.life"), "http://localhost:8787");
  assert.equal(
    apiUrlForPage("https://debo-os-api.example.workers.dev", "my.daksha.life"),
    "https://debo-os-api.example.workers.dev",
  );
  assert.equal(
    apiUrlForPage("https://api.debo.life", "debo-os-app.example.workers.dev"),
    "https://api.debo.life",
  );
  assert.equal(apiUrlForPage("https://api.debo.life", "my.daksha.life.evil.test"), "https://api.debo.life");
  assert.equal(apiUrlForPage("https://api.debo.life", "about.daksha.life"), "https://api.debo.life");
});
