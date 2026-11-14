// Talking to /api/mcp: the person's own tool servers. The server never sends a secret back,
// only whether one is saved.
import { z } from "zod";
import type { FuseApi } from "./api";

export const ToolServerSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string(),
  hasSecret: z.boolean(),
  headerName: z.string().optional(),
  autoRead: z.boolean(),
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

export async function addToolServer(
  api: FuseApi,
  input: { name: string; url: string; secret?: string; headerName?: string },
): Promise<ToolServer> {
  const parsed = ToolServerSchema.safeParse(await api.request<unknown>("/api/mcp", input));
  if (!parsed.success) throw new Error(UNREADABLE);
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
