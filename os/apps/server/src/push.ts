// Web push: reminders and the morning check-in reach a browser or installed web app even
// when Daksha is closed. Uses the `web-push` library (VAPID signing and payload encryption).
//
// It is off unless the server has both keys (DEBO_OS_VAPID_PUBLIC_KEY, DEBO_OS_VAPID_PRIVATE_KEY);
// then the app hides the switch. Each device the person turns it on for is one row of kind
// `push-subscriptions`: the push service's address and the device's public keys. The person
// turns it off per device (the row is deleted), and every row goes with "Delete my data".
//
// A push carries only a short title ("Good morning", "Call Mum"), never journal text or notes.
import { createHash } from "node:crypto";
import { Hono } from "hono";
import webpush from "web-push";
import { z } from "zod";
import type { Store } from "./db.ts";
import { backgroundFailure } from "./log.ts";

export const PUSH_KIND = "push-subscriptions";
const DEVICES_MAX = 10;
/** The subject push services may use to reach whoever runs the server. Not a person's address. */
export const DEFAULT_VAPID_SUBJECT = "https://daksha.life";

/**
 * The push services browsers use. A subscription to any other address is refused, so this
 * server can never be made to send requests to a place of someone's choosing.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^(?:[a-z0-9-]+\.)*push\.apple\.com$/,
  /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/,
];

export function allowedPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

const base64url = z.string().trim().min(16).max(200).regex(/^[A-Za-z0-9_-]+=*$/);
export const subscriptionInput = z.object({
  endpoint: z
    .string()
    .trim()
    .max(1000)
    .refine(allowedPushEndpoint, "This browser's push service is not one Daksha knows. Reminders still show in the app."),
  keys: z.object({ p256dh: base64url, auth: base64url }),
});

export interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  createdAt: string;
}

export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
) => Promise<{ statusCode: number }>;

export interface PushKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

/** The VAPID keys from the environment, or undefined when push is off. Never logs the values. */
export function pushKeysFromEnv(env: Record<string, string | undefined> = process.env): PushKeys | undefined {
  // The DAKSHA_ names are optional new names for the same settings (docs/RENAME.md).
  const publicKey = (env.DAKSHA_OS_VAPID_PUBLIC_KEY || env.DEBO_OS_VAPID_PUBLIC_KEY)?.trim();
  const privateKey = (env.DAKSHA_OS_VAPID_PRIVATE_KEY || env.DEBO_OS_VAPID_PRIVATE_KEY)?.trim();
  if (!publicKey || !privateKey) return undefined;
  const subject = (env.DAKSHA_OS_VAPID_SUBJECT || env.DEBO_OS_VAPID_SUBJECT)?.trim() || DEFAULT_VAPID_SUBJECT;
  return { publicKey, privateKey, subject };
}

const idOf = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex");

export class PushService {
  private readonly sender?: PushSender;
  constructor(
    private readonly db: Store,
    private readonly keys?: PushKeys,
    sender?: PushSender,
  ) {
    if (!keys) return;
    this.sender =
      sender ??
      ((subscription, payload) =>
        webpush.sendNotification(subscription, payload, {
          vapidDetails: { subject: keys.subject, publicKey: keys.publicKey, privateKey: keys.privateKey },
          TTL: 6 * 60 * 60,
          urgency: "normal",
        }));
  }

  get configured(): boolean {
    return Boolean(this.keys && this.sender);
  }

  get publicKey(): string | undefined {
    return this.keys?.publicKey;
  }

  async list(owner: string): Promise<PushSubscriptionRecord[]> {
    return this.db.list<PushSubscriptionRecord>(owner, PUSH_KIND);
  }

  async subscribe(owner: string, input: unknown): Promise<PushSubscriptionRecord> {
    const parsed = subscriptionInput.parse(input);
    const id = idOf(parsed.endpoint);
    const devices = await this.list(owner);
    if (!devices.some((d) => d.id === id) && devices.length >= DEVICES_MAX) {
      // The oldest device makes room: it is most likely one the person no longer uses.
      const oldest = [...devices].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      if (oldest) await this.db.remove(owner, PUSH_KIND, oldest.id);
    }
    return this.db.put<PushSubscriptionRecord>(owner, PUSH_KIND, {
      id,
      endpoint: parsed.endpoint,
      keys: parsed.keys,
      createdAt: devices.find((d) => d.id === id)?.createdAt ?? new Date().toISOString(),
    });
  }

  async unsubscribe(owner: string, endpoint: string): Promise<void> {
    await this.db.remove(owner, PUSH_KIND, idOf(endpoint));
  }

  /**
   * Sends one short title to every device the person turned push on for. A device the push
   * service no longer knows (404 or 410) is forgotten. Never throws.
   */
  async send(owner: string, title: string): Promise<number> {
    if (!this.sender) return 0;
    let sent = 0;
    const payload = JSON.stringify({ title: title.slice(0, 120) });
    for (const device of await this.list(owner).catch(() => [])) {
      try {
        await this.sender({ endpoint: device.endpoint, keys: device.keys }, payload);
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await this.db.remove(owner, PUSH_KIND, device.id).catch(() => {});
        else backgroundFailure("send push", error instanceof Error ? new Error(`push failed ${status ?? ""}`) : error);
      }
    }
    return sent;
  }
}

/** GET /api/push, POST /api/push/subscriptions, POST /api/push/unsubscribe. Mount after sign-in. */
export function pushRoutes(push: PushService) {
  const app = new Hono<{ Variables: { owner: string } }>();
  app.get("/", async (c) =>
    c.json({
      configured: push.configured,
      publicKey: push.publicKey ?? null,
      devices: (await push.list(c.get("owner"))).map((d) => ({ id: d.id, createdAt: d.createdAt })),
    }),
  );
  app.post("/subscriptions", async (c) => {
    if (!push.configured) return c.json({ error: "Reminders on this device are not set up on this server yet." }, 503);
    const saved = await push.subscribe(c.get("owner"), await c.req.json());
    return c.json({ device: { id: saved.id, createdAt: saved.createdAt } }, 201);
  });
  app.post("/unsubscribe", async (c) => {
    const { endpoint } = z.object({ endpoint: z.string().trim().min(1).max(1000) }).parse(await c.req.json());
    await push.unsubscribe(c.get("owner"), endpoint);
    return c.json({ ok: true });
  });
  return app;
}
