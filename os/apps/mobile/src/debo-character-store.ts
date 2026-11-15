// Which character the person talks to, shared by every face in the app.
//
// The choice is saved in the person's account (the assistant's identity, field
// `character`). This store holds the current value so every face changes at once, and
// keeps a copy on this device so the right face shows from the first moment, before the
// account has loaded. Nobody who never chose gets anything but the default.
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { type CharacterId, characterOrDefault, characters, defaultCharacter, pronounsFor } from "./debo-characters";

const KEY = "debo.character";

class CharacterStore {
  private current: CharacterId = defaultCharacter;
  private assistantName = characters[defaultCharacter].name;
  private listeners = new Set<() => void>();
  private started = false;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.current;
  getName = () => this.assistantName;

  /** The assistant's own name, as typed in "About Debo". Labels use it, not a fixed word. */
  setName = (value: string | undefined) => {
    const next = value?.trim() || characters[defaultCharacter].name;
    if (next === this.assistantName) return;
    this.assistantName = next;
    for (const listener of this.listeners) listener();
  };

  /** The account says which character this person chose (or nothing, so the default). */
  set = (value: unknown, save = true) => {
    const next = characterOrDefault(value);
    if (save) void saveCharacter(next);
    if (next === this.current) return;
    this.current = next;
    for (const listener of this.listeners) listener();
  };

  /** Loads the copy kept on this device. Called once, by the first face. */
  start() {
    if (this.started) return;
    this.started = true;
    void loadCharacter().then((value) => value && this.set(value, false));
  }
}

export const deboCharacter = new CharacterStore();

/** The chosen character. Re-renders when the person picks another one. */
export function useDeboCharacter(): CharacterId {
  deboCharacter.start();
  return useSyncExternalStore(deboCharacter.subscribe, deboCharacter.getSnapshot, deboCharacter.getSnapshot);
}

/** What to call the assistant in labels and screen-reader text: the name the person set. */
export function useAssistantName(): string {
  deboCharacter.start();
  return useSyncExternalStore(deboCharacter.subscribe, deboCharacter.getName, deboCharacter.getName);
}

/** "she" or "he" (and "her", "him", "his"...), following the chosen character, for labels. */
export function usePronouns(): ReturnType<typeof pronounsFor> {
  return pronounsFor(useDeboCharacter());
}

async function loadCharacter(): Promise<CharacterId | undefined> {
  try {
    const raw =
      Platform.OS === "web"
        ? (globalThis.localStorage?.getItem(KEY) ?? null)
        : await SecureStore.getItemAsync(KEY);
    return raw ? characterOrDefault(raw) : undefined;
  } catch {
    return undefined;
  }
}

async function saveCharacter(value: CharacterId): Promise<void> {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, value);
    else await SecureStore.setItemAsync(KEY, value);
  } catch {
    // The choice still applies until the app closes, and the account keeps it.
  }
}
