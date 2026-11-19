import { Container, getContainer } from "@cloudflare/containers";

// Required for outboundByHost below: the Containers runtime looks for this export
// on the Worker entry and refuses to start the container without it.
export { ContainerProxy } from "@cloudflare/containers";

import { AI_HOST, type AiLike, handleAi, handleMedia, MEDIA_HOST, type R2BucketLike } from "./media";

interface Env {
  API: DurableObjectNamespace<DeboApi>;
  /** Service binding to the private debo-os-browser Worker. */
  BROWSER: Fetcher;
  /** The private R2 bucket for voice notes and videos. Reached only through media.internal. */
  MEDIA?: R2BucketLike;
  /** Workers AI, for writing out recordings. Reached only through ai.internal. */
  AI?: AiLike;
  API_SLEEP_AFTER?: string;
  [name: string]: unknown;
}

/** Everything the API reads from its environment. Unset values are skipped. */
const PASSED = [
  // Plain settings
  "WORKSPACE_MODE",
  "AGENT_BACKEND",
  "MODEL",
  "TASK_WORKER_ENABLED",
  "TRUST_PROXY",
  "PUBLIC_API_URL",
  "ALLOWED_ORIGINS",
  "WEB_SEARCH_ENABLED",
  "AUTH_MODE",
  "OS_DB_SCHEMA",
  "DAILY_TOKEN_LIMIT",
  // Sign-in (Neon Auth). Public addresses, not secrets, but passed the same way.
  "NEON_AUTH_BASE_URL",
  "NEON_AUTH_JWKS_URL",
  // Database
  "DATABASE_URL",
  "DEBO_DATABASE_URL",
  // Daksha's journal: answers, meaning search, memory
  "ANTHROPIC_API_KEY",
  "NEON_AI_GATEWAY_BASE_URL",
  "NEON_AI_GATEWAY_TOKEN",
  "MEM0_API_KEY",
  // Connecting apps (Composio). Optional: without it the Apps screen says it is not set up.
  "COMPOSIO_API_KEY",
  // Voice notes and videos: the private bucket (R2_BUCKET is a plain setting) and the speech service
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "CF_AI_API_TOKEN",
  // Voice
  "LIVEKIT_URL",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
  "VOICE_AGENT_SECRET",
  // Optional: Daksha's own Cartesia account, for voice copies of custom people when the person has no key.
  "CARTESIA_API_KEY",
  // Keys for the API itself
  "TOKEN_ENCRYPTION_KEY",
  "SESSION_SIGNING_KEY",
  "WORKER_TOKEN",
  // Web push for reminders (VAPID). Optional: without both keys push is off and the app hides the switch.
  "DEBO_OS_VAPID_PUBLIC_KEY",
  "DEBO_OS_VAPID_PRIVATE_KEY",
  "DEBO_OS_VAPID_SUBJECT",
  // The same three under their new names (docs/RENAME.md). Read first when set.
  "DAKSHA_OS_VAPID_PUBLIC_KEY",
  "DAKSHA_OS_VAPID_PRIVATE_KEY",
  "DAKSHA_OS_VAPID_SUBJECT",
  // Optional
  "OPENFUSE_ACCESS_KEY", // only for AUTH_MODE=access-key; not used with Neon Auth
  "OPENAI_API_KEY",
  "GOOGLE_GENERATIVE_AI_API_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

/** Fixed made-up host the API uses to reach the browser; see outboundByHost below. */
const BROWSER_HOST = "browser.internal";

export class DeboApi extends Container<Env> {
  defaultPort = 8787;
  requiredPorts = [8787];
  pingEndpoint = "localhost/api/health";
  enableInternet = true;
  sleepAfter: string | number;

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env);
    this.sleepAfter = env.API_SLEEP_AFTER ?? "10m";
    const vars: Record<string, string> = { HOST: "0.0.0.0", PORT: "8787" };
    for (const key of PASSED) {
      const value = env[key];
      if (typeof value === "string" && value !== "") vars[key] = value;
    }
    // The API calls http://browser.internal. The Containers runtime intercepts that
    // hostname (below) and hands the request to the private browser Worker.
    if (env.BROWSER) vars.BROWSER_WORKER_URL = `http://${BROWSER_HOST}`;
    // Recordings through bindings: no R2 keys and no API token. The API calls these made-up
    // hosts; the Containers runtime hands the requests to the handlers below.
    if (env.MEDIA) {
      vars.MEDIA_BACKEND = "binding";
      vars.MEDIA_BINDING_URL = `http://${MEDIA_HOST}`;
    }
    if (env.AI) {
      vars.AI_BACKEND = "binding";
      vars.AI_BINDING_URL = `http://${AI_HOST}`;
    }
    this.envVars = vars;
  }

  override onError(error: unknown) {
    console.error("debo-os-api container error", String(error));
  }
}

// Plain-HTTP interception: the request never leaves Cloudflare and never touches the
// public internet. Only this container's outbound traffic can reach the binding.
//
// This must be an assignment after the class, not a `static` field inside it. The
// library registers handlers in a setter on its base class, and a static class field
// defines a new property without calling that setter. The handler was then never
// registered, the call fell through to the open internet, and the browser showed as
// offline (HTTP 530 for browser.internal).
DeboApi.outboundByHost = {
  [BROWSER_HOST]: (request: Request, env: Env) => env.BROWSER.fetch(request),
  [MEDIA_HOST]: (request: Request, env: Env) =>
    env.MEDIA ? handleMedia(request, env.MEDIA) : new Response("No bucket", { status: 503 }),
  [AI_HOST]: (request: Request, env: Env) =>
    env.AI ? handleAi(request, env.AI) : new Response("No AI binding", { status: 503 }),
};

const api = (env: Env) => getContainer(env.API, "main");

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return api(env).fetch(request);
  },

  // Wakes the container so the in-process task worker keeps durable tasks moving.
  // Starting it runs the engine's first tick, and the health call renews the idle timer.
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    const res = await api(env).fetch(new Request("http://container/api/health"));
    if (!res.ok) console.error("debo-os-api keep-awake health check failed", res.status);
  },
} satisfies ExportedHandler<Env>;
