// A small signal for "a setting changed somewhere else". When the assistant changes a
// setting from chat or a call, its card says so here, and any open settings screen loads
// its values again, so what the person sees always matches what is saved.
import { useEffect, useRef } from "react";

export type SettingsKind = "talk-settings" | "identity" | "reminders";

const listeners = new Set<(kind: SettingsKind) => void>();

export function settingsChanged(kind: SettingsKind) {
  for (const listener of listeners) listener(kind);
}

export function onSettingsChanged(listener: (kind: SettingsKind) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Calls `reload` whenever one of `kinds` changes. */
export function useSettingsChanged(kinds: readonly SettingsKind[], reload: () => unknown) {
  const latest = useRef(reload);
  latest.current = reload;
  const key = kinds.join(",");
  useEffect(
    () =>
      onSettingsChanged((kind) => {
        if (key.split(",").includes(kind)) void latest.current();
      }),
    [key],
  );
}
