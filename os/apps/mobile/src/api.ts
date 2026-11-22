import { Platform } from "react-native";
import { apiUrlForPage } from "./api-address";
import { apiCandidates, expectsNeonSignIn } from "./api-health";
import { readApiPayload } from "./api-response";
import { timeZoneHeaders } from "./time-zone";

const pageHost = Platform.OS === "web" && typeof window !== "undefined" ? window.location?.host : undefined;

// On the web, my.daksha.life talks to api.daksha.life so its sign-in cookie stays same-site
// (see api-address.ts). Phones have no page address and keep the built-in one.
export const BUILT_IN_API_URL = apiUrlForPage(
  process.env.EXPO_PUBLIC_API_URL ||
    (Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787"),
  pageHost,
);

/** The addresses to try at start, in order: the built-in one, then EXPO_PUBLIC_API_URL_FALLBACK. */
export const API_CANDIDATES = apiCandidates(BUILT_IN_API_URL, process.env.EXPO_PUBLIC_API_URL_FALLBACK);

/** True when this build signs people in with Neon Auth, so the access-key screen never shows. */
export const EXPECTS_NEON = expectsNeonSignIn(process.env.EXPO_PUBLIC_AUTH_MODE, pageHost);

let current = BUILT_IN_API_URL;
/** The API address this session uses. The start-up check may switch it to the fallback. */
export const apiUrl = () => current;
/** Called once the start-up check found an address that answers. */
export function setApiAddress(base: string) {
  current = base.replace(/\/$/, "");
}

export class FuseApi {
  constructor(readonly token: string) {}
  async request<T>(path: string, body?: unknown, method?: string): Promise<T> {
    const response = await fetch(`${apiUrl()}${path}`, {
      method: method ?? (body === undefined ? "GET" : "POST"),
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...timeZoneHeaders(),
        ...(body === undefined || body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    const payload = await readApiPayload<T>(response);
    return payload;
  }
  url(path: string) {
    return path.startsWith("http") ? path : `${apiUrl()}${path}`;
  }
}

export async function createSession(
  accessKey?: string,
): Promise<{ token: string; mode: "sample" | "live" }> {
  const response = await fetch(`${apiUrl()}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accessKey }),
  });
  const payload = await readApiPayload<{ token: string; mode: "sample" | "live" }>(
    response,
    "Could not open your workspace.",
  );
  return payload;
}
