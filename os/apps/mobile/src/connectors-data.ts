// Talking to /api/connectors, and reading what comes back. The server holds the sign-in to
// each app (through Composio); the app only ever sees names, states and dates.
import { z } from "zod";
import type { FuseApi } from "./api";

export const ConnectionSchema = z.object({
  id: z.string(),
  toolkit: z.string(),
  name: z.string(),
  state: z.enum(["connected", "waiting", "failed", "expired"]),
  statusText: z.string(),
  connectedAt: z.string(),
});
export const CatalogueItemSchema = z.object({
  slug: z.string(),
  name: z.string(),
  blurb: z.string(),
  logo: z.string().optional(),
  connectable: z.boolean(),
  categories: z.array(z.string()).optional(),
});
export const CataloguePageSchema = z.object({
  items: z.array(CatalogueItemSchema),
  total: z.number(),
  nextOffset: z.number().nullable(),
  categories: z.array(z.object({ name: z.string(), count: z.number() })).optional(),
});
const OverviewSchema = z.object({
  configured: z.boolean(),
  message: z.string().optional(),
  connections: z.array(ConnectionSchema),
  curated: z.array(CatalogueItemSchema),
});
const LinkSchema = z.object({ id: z.string(), url: z.string(), name: z.string() });

export type AppConnection = z.infer<typeof ConnectionSchema>;
export type AppItem = z.infer<typeof CatalogueItemSchema>;
export type CataloguePage = z.infer<typeof CataloguePageSchema>;
export type ConnectorsOverview = z.infer<typeof OverviewSchema>;

const UNREADABLE = "I couldn't read the list of apps. Try again in a moment.";
export const APPS_OFFLINE = "I couldn't reach Daksha just now. Check your internet, then press Try again.";
export const APPS_SLOW = "Daksha is taking too long to answer. Press Try again in a moment.";
export const APPS_BUSY = "Daksha is busy or restarting. Press Try again in a minute.";
export const APPS_SIGNED_OUT = "Your sign-in ran out. Sign out, sign in again, then come back to Apps.";

/**
 * The words to show for a failed Apps request. The server's own plain sentence is kept.
 * Network failures ("Failed to fetch"), timeouts and bare status codes become a next step.
 */
export function plainAppsError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  if (name === "AbortError" || name === "TimeoutError") return APPS_SLOW;
  if (name === "TypeError" || /failed to fetch|network request failed|load failed|networkerror/i.test(message))
    return APPS_OFFLINE;
  const status = /^Request failed \((\d{3})\)/.exec(message)?.[1];
  if (status === "401") return APPS_SIGNED_OUT;
  if (status || /unreadable response/i.test(message)) return APPS_BUSY;
  return message || APPS_BUSY;
}

/** How long one Apps request may take. Starting a connection asks the provider twice. */
const LIST_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 45_000;

async function ask<T>(api: FuseApi, path: string, timeoutMs: number, body?: unknown, method?: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await api.request<T>(path, body, method, { signal: controller.signal });
  } catch (error) {
    throw new Error(plainAppsError(error));
  } finally {
    clearTimeout(timer);
  }
}

export async function loadConnectors(api: FuseApi): Promise<ConnectorsOverview> {
  const parsed = OverviewSchema.safeParse(await ask<unknown>(api, "/api/connectors", LIST_TIMEOUT_MS));
  if (!parsed.success) throw new Error(UNREADABLE);
  return parsed.data;
}

/** One page of the whole catalogue: every app, or the ones that match words and a category. */
export async function browseApps(
  api: FuseApi,
  options: { q?: string; category?: string; offset?: number; limit?: number },
): Promise<CataloguePage> {
  const params = new URLSearchParams();
  if (options.q) params.set("q", options.q);
  if (options.category) params.set("category", options.category);
  params.set("offset", String(options.offset ?? 0));
  params.set("limit", String(options.limit ?? 20));
  const parsed = CataloguePageSchema.safeParse(
    await ask<unknown>(api, `/api/connectors/search?${params}`, LIST_TIMEOUT_MS),
  );
  if (!parsed.success) throw new Error(UNREADABLE);
  return parsed.data;
}

/** Asks the server for the app's own sign-in page. `to` says where the page sends people after. */
export async function startConnect(api: FuseApi, slug: string, to: "web" | "native") {
  const parsed = LinkSchema.safeParse(
    await ask<unknown>(api, `/api/connectors/${encodeURIComponent(slug)}/connect`, CONNECT_TIMEOUT_MS, { to }),
  );
  if (!parsed.success) throw new Error("I couldn't start connecting that app. Try again.");
  return parsed.data;
}

export async function disconnectApp(api: FuseApi, id: string) {
  await ask(api, `/api/connectors/${encodeURIComponent(id)}`, LIST_TIMEOUT_MS, undefined, "DELETE");
}

/** The most useful connection for each app: a finished one beats an unfinished one. */
export function connectionsBySlug(connections: AppConnection[]) {
  const rank = { connected: 3, waiting: 2, failed: 1, expired: 0 } as const;
  const map = new Map<string, AppConnection>();
  for (const connection of connections) {
    const current = map.get(connection.toolkit);
    if (!current || rank[connection.state] > rank[current.state]) map.set(connection.toolkit, connection);
  }
  return map;
}

/** "Slack" from a tool name such as SLACK_SEND_MESSAGE, for a card shown before the answer arrives. */
export function appFromToolName(tool: unknown) {
  if (typeof tool !== "string" || !tool) return undefined;
  const first = tool.split("_")[0] ?? "";
  return first ? first[0] + first.slice(1).toLowerCase() : undefined;
}

export type ConnectorToolView =
  | { kind: "error"; message: string }
  | { kind: "found"; apps: string[]; count: number }
  | { kind: "none"; message: string }
  | { kind: "read"; app: string }
  | { kind: "review"; app: string; title: string; actionId: string }
  | { kind: "unreadable" };

/** What a find_app_tools or use_app_tool result means, in the card's terms. */
export function readConnectorTool(name: "find_app_tools" | "use_app_tool", result: unknown): ConnectorToolView {
  let value = result;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { kind: "unreadable" };
    }
  }
  if (!value || typeof value !== "object") return { kind: "unreadable" };
  const v = value as Record<string, unknown>;
  if (typeof v.error === "string") return { kind: "error", message: v.error };
  if (name === "find_app_tools") {
    const tools = Array.isArray(v.tools) ? (v.tools as { app?: unknown; server?: unknown }[]) : [];
    if (!tools.length)
      return {
        kind: "none",
        message: typeof v.message === "string" ? v.message : "I found no matching tools.",
      };
    const apps = [
      ...new Set(
        tools
          .map((t) => (typeof t.app === "string" ? t.app : typeof t.server === "string" ? t.server : ""))
          .filter(Boolean),
      ),
    ];
    return { kind: "found", apps, count: tools.length };
  }
  if (typeof v.actionId === "string" && typeof v.status === "string")
    return {
      kind: "review",
      app: typeof v.app === "string" ? v.app : "your app",
      title: typeof v.title === "string" ? v.title : "A change",
      actionId: v.actionId,
    };
  if (typeof v.source === "string") return { kind: "read", app: v.source.split(",")[0] ?? "your app" };
  return { kind: "unreadable" };
}
