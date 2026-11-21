// App events for triggers (triggers/service.ts) through Composio: watch one event type for one
// person, stop watching, list an app's event types, and check the signature on Composio's
// webhook. Needs COMPOSIO_API_KEY and COMPOSIO_WEBHOOK_SECRET (the project's webhook secret);
// without both, app-event triggers are off. Composio is told only the event type and its
// settings; the event data comes back to Daksha's own webhook address.
import type { Composio } from "@composio/core";
import type { AppEventSource } from "../triggers/service.ts";

type Env = Record<string, string | undefined>;

export function composioEventsFromEnv(env: Env = process.env): AppEventSource | undefined {
  const apiKey = env.COMPOSIO_API_KEY?.trim();
  const secret = env.COMPOSIO_WEBHOOK_SECRET?.trim();
  if (!apiKey || !secret) return undefined;
  let sdk: Promise<Composio> | undefined;
  const client = () =>
    (sdk ??= import("@composio/core").then(({ Composio }) => new Composio({ apiKey, allowTracking: false })));
  return {
    async create(owner, event, config) {
      const made = await (await client()).triggers.create(owner, event, { triggerConfig: config });
      return { remoteId: made.triggerId };
    },
    async remove(remoteId) {
      await (await client()).triggers.delete(remoteId);
    },
    async types(app) {
      const list = await (await client()).triggers.listTypes({ toolkits: [app], limit: 40 });
      return list.items.map((t) => ({ event: t.slug, name: t.name, description: (t.description ?? "").slice(0, 300) }));
    },
    async verify(rawBody, headers) {
      try {
        const result = await (await client()).triggers.verifyWebhook({
          id: headers.get("webhook-id") ?? "",
          payload: rawBody,
          secret,
          signature: headers.get("webhook-signature") ?? "",
          timestamp: headers.get("webhook-timestamp") ?? "",
        });
        const p = result.payload;
        return {
          remoteId: p.metadata.id,
          userId: p.userId,
          app: p.toolkitSlug.toLowerCase(),
          event: p.triggerSlug,
          eventId: headers.get("webhook-id") ?? p.uuid,
          data: p.payload ?? {},
        };
      } catch {
        return null;
      }
    },
  };
}
