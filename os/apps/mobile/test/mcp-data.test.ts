import assert from "node:assert/strict";
import test from "node:test";
import {
  COMPOSIO_CONNECT_URL,
  composioHeaderFor,
  freeName,
  isComposioUrl,
  ToolServerSchema,
} from "../src/mcp-data.ts";

test("the Composio card knows Composio's addresses and the header for each", () => {
  assert.equal(isComposioUrl(COMPOSIO_CONNECT_URL), true);
  assert.equal(isComposioUrl("https://backend.composio.dev/v3/mcp/abc?user_id=me"), true);
  assert.equal(isComposioUrl("https://composio.dev.example.com/mcp"), false);
  assert.equal(isComposioUrl("not a url"), false);
  assert.equal(composioHeaderFor(COMPOSIO_CONNECT_URL), "x-consumer-api-key");
  assert.equal(composioHeaderFor("https://backend.composio.dev/v3/mcp/abc"), "x-api-key");
});

test("a second Composio gets a name that is free", () => {
  assert.equal(freeName("Composio"), "Composio");
  assert.equal(freeName("Composio", [{ name: "composio" }]), "Composio 2");
  assert.equal(freeName("Composio", [{ name: "Composio" }, { name: "Composio 2" }]), "Composio 3");
});

test("a sign-in server reads, and an older server without the new fields still reads", () => {
  const base = { id: "1", name: "N", url: "https://x.example/mcp", hasSecret: false, autoRead: false, tools: [], createdAt: "2026-11-15" };
  assert.equal(ToolServerSchema.safeParse(base).success, true);
  const signIn = ToolServerSchema.parse({ ...base, auth: "sign-in", signedIn: true, preset: "composio" });
  assert.equal(signIn.signedIn, true);
  assert.equal(ToolServerSchema.safeParse({ ...base, auth: "token" }).success, false);
});
