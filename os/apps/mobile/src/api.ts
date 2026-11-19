import { Platform } from "react-native";
import { apiUrlForPage } from "./api-address";
import { readApiPayload } from "./api-response";
import { timeZoneHeaders } from "./time-zone";

// On the web, my.daksha.life talks to api.daksha.life so its sign-in cookie stays same-site
// (see api-address.ts). Phones have no page address and keep the built-in one.
export const API_URL = apiUrlForPage(
  process.env.EXPO_PUBLIC_API_URL ||
    (Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787"),
  Platform.OS === "web" && typeof window !== "undefined" ? window.location?.host : undefined,
);

export class FuseApi {
  constructor(readonly token: string) {}
  async request<T>(path: string, body?: unknown, method?: string): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
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
    return path.startsWith("http") ? path : `${API_URL}${path}`;
  }
}

export async function createSession(
  accessKey?: string,
): Promise<{ token: string; mode: "sample" | "live" }> {
  const response = await fetch(`${API_URL}/api/session`, {
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
