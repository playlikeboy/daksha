/**
 * Finding a Daksha API that answers, before the app chooses a sign-in screen.
 * Pure (no React, no react-native), so tests can run it with a fake `fetch` and clock.
 *
 * The app asks `/api/health` which sign-in the API uses. One failed request used to send
 * a production app to the access-key screen meant for local installs. Now it:
 * 1. tries each address (the built-in one first, then the fallback) a few times, waiting
 *    a little longer between rounds, about 10 seconds in all;
 * 2. uses the first address that answers for the whole session;
 * 3. in a build made for Neon sign-in, never falls back to the access-key screen: when
 *    nothing answers it says Daksha can't be reached, with a Try again button.
 */

export type AuthInfo =
  | { mode: "neon"; neonAuthUrl: string }
  | { mode: "access-key" }
  /** Nothing answered. Only a Neon build shows this; the screen offers Try again. */
  | { mode: "unreachable" };

export interface FoundApi {
  /** The API address that answered, without a trailing slash. */
  base: string;
  auth: AuthInfo;
}

export interface ProbeOptions {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Waits between rounds. One round more than waits: 4 rounds by default. */
  waits?: number[];
  /** How long one request may take before it counts as failed. */
  timeoutMs?: number;
}

/** About 10 seconds in all when nothing answers quickly: 4 rounds, waiting 1, 2 and 4 seconds. */
export const DEFAULT_WAITS = [1_000, 2_000, 4_000];

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** The addresses to try, in order, without repeats or blanks. */
export function apiCandidates(primary: string, fallback: string | undefined): string[] {
  const clean = [primary, fallback ?? ""].map((url) => url.trim().replace(/\/$/, "")).filter(Boolean);
  return [...new Set(clean)];
}

/**
 * True when this build is meant for Neon sign-in, so the access-key screen must never show:
 * the deploy workflows set EXPO_PUBLIC_AUTH_MODE=neon, and the live sites are known by name.
 */
export function expectsNeonSignIn(flag: string | undefined, pageHost: string | undefined): boolean {
  if (flag?.trim().toLowerCase() === "neon") return true;
  const host = pageHost?.toLowerCase().replace(/:\d+$/, "");
  return Boolean(host && /(^|\.)(daksha|debo)\.life$/.test(host));
}

/** One `/api/health` request. Undefined when it failed or the answer was not Daksha's. */
export async function askHealth(
  base: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<AuthInfo | undefined> {
  const controller = typeof AbortController === "undefined" ? undefined : new AbortController();
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const response = await fetchImpl(`${base}/api/health`, { signal: controller?.signal });
    if (!response.ok) return undefined;
    const body = (await response.json()) as { auth?: { mode?: unknown; neonAuthUrl?: unknown } } | null;
    const auth = body?.auth;
    if (auth?.mode === "neon" && typeof auth.neonAuthUrl === "string" && auth.neonAuthUrl)
      return { mode: "neon", neonAuthUrl: auth.neonAuthUrl };
    if (auth?.mode === "access-key") return { mode: "access-key" };
    // Older servers had no auth block: they use the access key.
    if (body && typeof body === "object" && "ok" in body && !auth) return { mode: "access-key" };
    return undefined;
  } catch {
    return undefined;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Tries every address each round, then waits and tries again. Gives back the first one
 * that answers. When `neonOnly` is set, an answer of "access-key" does not count: a
 * production build talking to a server set up without accounts is a broken setup, and the
 * person should see "can't reach" rather than a developer screen.
 */
export async function findApi(
  candidates: string[],
  neonOnly: boolean,
  options: ProbeOptions = {},
): Promise<FoundApi | undefined> {
  const fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  const sleep = options.sleep ?? wait;
  const waits = options.waits ?? DEFAULT_WAITS;
  const timeoutMs = options.timeoutMs ?? 4_000;
  for (let round = 0; round <= waits.length; round++) {
    for (const base of candidates) {
      const auth = await askHealth(base, fetchImpl, timeoutMs);
      if (auth && !(neonOnly && auth.mode !== "neon")) return { base, auth };
    }
    if (round < waits.length) await sleep(waits[round]);
  }
  return undefined;
}

/** What the app does with the result: a found address, or which screen to show without one. */
export function authAfterProbe(found: FoundApi | undefined, neonOnly: boolean): AuthInfo {
  if (found) return found.auth;
  // A local or demo install: the access-key screen already explains a missing server.
  return neonOnly ? { mode: "unreachable" } : { mode: "access-key" };
}
