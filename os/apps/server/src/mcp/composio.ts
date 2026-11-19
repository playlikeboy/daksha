// A person's OWN Composio account, added as a tool server. This is not Daksha's Composio (that one
// lives in ../connectors and uses Daksha's key). Here the person brings their key, or signs in.
//
//   - Composio Connect, https://connect.composio.dev/mcp: one server for every app the person
//     connected in their Composio account. It takes a sign-in (OAuth), or a key in the
//     `x-consumer-api-key` header.
//   - A Composio project's own MCP address (https://backend.composio.dev/v3/mcp/<id>?user_id=...)
//     takes the project key in the `x-api-key` header.
// Checked against docs.composio.dev and the live discovery documents on 15 November 2026.

export const COMPOSIO_CONNECT_URL = "https://connect.composio.dev/mcp";

function host(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}

/** True for an address on composio.dev, the only place the Composio choice may point. */
export function isComposioUrl(url: string) {
  const name = host(url);
  return name === "composio.dev" || name.endsWith(".composio.dev");
}

/** The header a Composio key goes in, for this address. */
export function composioHeaderFor(url: string) {
  return host(url) === "connect.composio.dev" ? "x-consumer-api-key" : "x-api-key";
}
