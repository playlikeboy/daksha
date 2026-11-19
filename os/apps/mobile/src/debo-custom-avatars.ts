// The faces the person made, as the app reads and saves them (server: custom-avatars.ts,
// records kind `custom-avatars`). Anything that shows a list of saved faces (the
// character picker, a custom person's card) uses `useCustomAvatars`, and refreshes when
// the builder saves or deletes one.
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { AvatarConfig, CustomAvatar } from "../../../packages/domain/src/avatar";
import type { FuseApi } from "./api";
import { errorText } from "./debo-api";

export type { AvatarConfig, CustomAvatar };

// A counter the builder bumps after every change, so every open list loads again.
let version = 0;
const listeners = new Set<() => void>();
export function customAvatarsChanged() {
  version += 1;
  for (const listener of listeners) listener();
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const getVersion = () => version;

export const listAvatars = async (api: FuseApi) =>
  api.request<{ avatars: CustomAvatar[]; limits: { max: number } }>("/api/custom-avatars");
export const getAvatar = async (api: FuseApi, id: string) =>
  (await api.request<{ avatar: CustomAvatar }>(`/api/custom-avatars/${encodeURIComponent(id)}`)).avatar;

/** Saves a new face, or changes the one with `id`. */
export async function saveAvatar(api: FuseApi, config: AvatarConfig, id?: string): Promise<CustomAvatar> {
  const reply = id
    ? await api.request<{ avatar: CustomAvatar }>(`/api/custom-avatars/${encodeURIComponent(id)}`, config, "PUT")
    : await api.request<{ avatar: CustomAvatar }>("/api/custom-avatars", config, "POST");
  customAvatarsChanged();
  return reply.avatar;
}

export async function deleteAvatar(api: FuseApi, id: string): Promise<void> {
  await api.request(`/api/custom-avatars/${encodeURIComponent(id)}`, undefined, "DELETE");
  customAvatarsChanged();
}

/** The saved faces, loaded when shown and again after any change. */
export function useCustomAvatars(api: FuseApi, enabled = true) {
  const changed = useSyncExternalStore(subscribe, getVersion, getVersion);
  const [avatars, setAvatars] = useState<CustomAvatar[]>([]);
  const [max, setMax] = useState(10);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const reply = await listAvatars(api);
      setAvatars(reply.avatars);
      setMax(reply.limits.max);
      setError("");
    } catch (e) {
      setError(errorText(e));
    }
  }, [api]);
  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load, changed]);
  return { avatars, max, error, reload: load };
}
