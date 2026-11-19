// Talking to /api/mcp: the person's own tool servers. The server never sends a secret or a
// sign-in token back, only whether one is saved.
import { z } from "zod";
import type { FuseApi } from "./api";

export const ToolServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  hasSecret: z.boolean(),
  headerName: z.string().optional(),
  autoRead: z.boolean(),
  /** How Daksha gets in: a sign-in (OAuth), a saved secret, or nothing. */
  auth: z.enum(["sign-in", "key", "none"]).optional(),
  signedIn: z.boolean().optional(),
  preset: z.enum(["composio"]).optional(),
  tools: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      access: z.enum(["reads", "changes", "destructive"]),
    }),
  ),
  toolsAt: z.string().optional(),
  lastOk: z.boolean().optional(),
  lastAt: z.string().optional(),
  lastMessage: z.string().optional(),
  createdAt: z.string(),
});
export type ToolServer = z.infer<typeof ToolServerSchema>;

const UNREADABLE = "I couldn't read your tool servers. Try again in a moment.";

export async function loadToolServers(api: FuseApi): Promise<ToolServer[]> {
  const parsed = z
    .object({ servers: z.array(ToolServerSchema) })
    .safeParse(await api.request<unknown>("/api/mcp"));
  if (!parsed.success) throw new Error(UNREADABLE);
  return parsed.data.servers;
}

export type ReturnTo = "web" | "native";

/** Adds a server. With `auth: "sign-in"` the answer also carries the sign-in page to open. */
export async function addToolServer(
  api: FuseApi,
  input: {
    name: string;
    url: string;
    secret?: string;
    headerName?: string;
    auth?: "sign-in" | "secret";
    preset?: "composio";
    to?: ReturnTo;
  },
): Promise<ToolServer & { signInUrl?: string }> {
  const parsed = ToolServerSchema.extend({ signInUrl: z.string().url().optional() }).safeParse(
    await api.request<unknown>("/api/mcp", input),
  );
  if (!parsed.success) throw new Error(UNREADABLE);
  return parsed.data;
}

/** Starts a new sign-in for a server that uses one. Returns the page to open. */
export async function startToolServerSignIn(api: FuseApi, id: string, to: ReturnTo) {
  const parsed = z
    .object({ url: z.string().url() })
    .safeParse(await api.request<unknown>(`/api/mcp/${encodeURIComponent(id)}/sign-in`, { to }));
  if (!parsed.success) throw new Error("I couldn't start the sign-in. Try again in a moment.");
  return parsed.data;
}

async function change(api: FuseApi, path: string, body: unknown, method: string) {
  const parsed = ToolServerSchema.safeParse(await api.request<unknown>(path, body, method));
  if (!parsed.success) throw new Error(UNREADABLE);
  return parsed.data;
}
export const refreshToolServer = (api: FuseApi, id: string) =>
  change(api, `/api/mcp/${encodeURIComponent(id)}/refresh`, {}, "POST");
export const setToolServerReads = (api: FuseApi, id: string, autoRead: boolean) =>
  change(api, `/api/mcp/${encodeURIComponent(id)}`, { autoRead }, "PATCH");
export const signOutToolServer = (api: FuseApi, id: string) =>
  change(api, `/api/mcp/${encodeURIComponent(id)}/sign-in`, undefined, "DELETE");
export async function removeToolServer(api: FuseApi, id: string) {
  await api.request(`/api/mcp/${encodeURIComponent(id)}`, undefined, "DELETE");
}

/** The host of an address, for a short line such as "tools.example.com". */
export function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

// Bring your own Composio. The same rules as the server's mcp/composio.ts.
/** Composio Connect: every app the person connected in their own Composio account. */
export const COMPOSIO_CONNECT_URL = "https://connect.composio.dev/mcp";

function hostName(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return "";
  }
}
export function isComposioUrl(url: string) {
  const name = hostName(url);
  return name === "composio.dev" || name.endsWith(".composio.dev");
}
/** The header a Composio key goes in, for this address. */
export function composioHeaderFor(url: string) {
  return hostName(url) === "connect.composio.dev" ? "x-consumer-api-key" : "x-api-key";
}

/** "Composio", or "Composio 2" and so on when that name is taken. Names are compared without case. */
export function freeName(base: string, servers: { name: string }[] = []) {
  const taken = new Set(servers.map((s) => s.name.toLowerCase()));
  for (let n = 1; n < 100; n++) {
    const name = n === 1 ? base : `${base} ${n}`;
    if (!taken.has(name.toLowerCase())) return name;
  }
  return base;
}
