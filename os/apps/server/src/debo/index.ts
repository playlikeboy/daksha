import type { Config } from "../config.ts";
import { ffmpegTools, fakeAudioTools } from "./audio.ts";
import { type MediaDeps } from "./media-service.ts";
import { memoryStore } from "./dev-store.ts";
import { type BindingStore, bindingStore } from "./binding-store.ts";
import { r2ConfigFromEnv, r2Store } from "./object-store.ts";
import { bindingWhisper, cloudflareWhisper, fakeTranscriber } from "./transcriber.ts";
import { type DeboBackend, deboDatabaseUrl, realBackend } from "./backend.ts";
import { devMemoryBackend } from "./dev-backend.ts";
import { DeboService } from "./service.ts";

export { deboRoutes } from "./routes.ts";
export { CALL_IDLE_MS, DeboService } from "./service.ts";
export { MediaService, type MediaDeps } from "./media-service.ts";
export {
  addJournalEntryInput,
  askMyLifeInput,
  deboInstructions,
  deboReadTools,
  deboTaskInstructions,
  deboTools,
  searchMyJournalInput,
} from "./tools.ts";

/** DEBO_DEV_MEMORY=1 asks for the dev-only in-memory journal. */
export function devMemoryRequested(env: Record<string, string | undefined> = process.env): boolean {
  return ["1", "true", "on"].includes(env.DEBO_DEV_MEMORY?.trim().toLowerCase() ?? "");
}

/**
 * Where recordings are kept and who writes them out, from the environment.
 *
 * Storage, first match wins:
 *  1. R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY (and R2_BUCKET): presigned links, the app
 *     talks to R2 directly.
 *  2. MEDIA_BACKEND=binding with MEDIA_BINDING_URL and SESSION_SIGNING_KEY: the Worker's R2 binding,
 *     reached through the private host media.internal. No keys; the app uploads and plays through this server.
 * Speech: CF_AI_API_TOKEN (REST, with the R2 account id), else AI_BACKEND=binding with AI_BINDING_URL
 * (the Worker's AI binding).
 * Without storage there are no recordings. Without speech, recordings are kept but nothing is written out.
 */
export function mediaFromEnv(env: Record<string, string | undefined>, publicUrl = ""): MediaDeps | undefined {
  const r2 = r2ConfigFromEnv(env);
  const apiToken = env.CF_AI_API_TOKEN?.trim();
  const secret = env.SESSION_SIGNING_KEY?.trim();
  const mediaUrl = env.MEDIA_BINDING_URL?.trim();
  const aiUrl = env.AI_BINDING_URL?.trim();
  const useBindings = env.MEDIA_BACKEND?.trim() === "binding" && mediaUrl && secret && publicUrl;
  const store = r2 ? r2Store(r2) : useBindings ? bindingStore({ mediaUrl, publicUrl, secret }) : undefined;
  if (!store) return undefined;
  const transcriber =
    r2 && apiToken
      ? cloudflareWhisper({ accountId: r2.accountId, apiToken })
      : env.AI_BACKEND?.trim() === "binding" && aiUrl
        ? bindingWhisper(aiUrl)
        : undefined;
  // Through this server, a part must stay under every request limit on the way. 8 MiB: above R2's 5 MiB
  // minimum, below the 12 MB general limit, and small enough to retry cheaply on a phone connection.
  return { store, audio: ffmpegTools(), transcriber, ...(r2 ? {} : { partBytes: 8 * 1024 * 1024 }) };
}

/**
 * The personal brain for this server.
 *
 * It needs the Daksha database: DEBO_DATABASE_URL, or DATABASE_URL in a live
 * workspace. In a sample (demo) workspace DATABASE_URL belongs to the demo
 * store, so only an explicit DEBO_DATABASE_URL counts. Without one, the
 * service reports "not set up" and every feature says so plainly.
 */
export function createDebo(
  config: Pick<Config, "mode"> & { publicUrl?: string },
  env: Record<string, string | undefined> = process.env,
  backend?: DeboBackend,
  media?: MediaDeps,
): DeboService {
  if (backend) return new DeboService(backend, [], media);
  if (devMemoryRequested(env)) {
    // Never in a live workspace: it would look like a real journal and forget everything.
    if (config.mode !== "sample")
      throw new Error("DEBO_DEV_MEMORY is for sample workspaces only. Remove it from a live workspace.");
    console.warn("[Daksha] DEV ONLY: the journal is in memory and is forgotten when the server stops.");
    // Recordings work too: an in-memory bucket (served under /api/dev-r2) and a fake speech engine.
    // DEBO_DEV_FAIL_FIRST=1: the first transcript fails, so the "Try again" screen can be seen.
    let failedOnce = !["1", "true"].includes(env.DEBO_DEV_FAIL_FIRST?.trim().toLowerCase() ?? "");
    const store = memoryStore((config.publicUrl ?? "http://localhost:8787").replace(/\/$/, ""));
    const service = new DeboService(devMemoryBackend(), ["local-user"], {
      store,
      audio: fakeAudioTools({ durationSeconds: 12 }),
      transcriber: fakeTranscriber({ fail: () => (failedOnce ? false : ((failedOnce = true), "retryable")) }),
      // Small sizes, so a few-megabyte test file goes up in parts like a big one would.
      singleMaxBytes: 2 * 1024 * 1024,
      partBytes: 1024 * 1024,
    });
    service.devStore = store.routes();
    return service;
  }
  const url = config.mode === "sample" ? env.DEBO_DATABASE_URL?.trim() || undefined : deboDatabaseUrl(env);
  const made = url ? mediaFromEnv(env, config.publicUrl) : undefined;
  const service = new DeboService(url ? realBackend(url, env) : null, [], made);
  if (made && "routes" in made.store) service.blobRoutes = (made.store as BindingStore).routes();
  return service;
}
