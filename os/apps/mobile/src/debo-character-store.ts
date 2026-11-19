// Which character the person talks to, shared by every face in the app.
//
// The choice is saved in the person's account (the assistant's identity, field
// `character`). This store holds the current value so every face changes at once, and
// keeps a copy on this device so the right face shows from the first moment, before the
// account has loaded. Nobody who never chose gets anything but the default.
//
// For a face the person made (character "custom"), it also holds that face's drawing data
// (the saved avatar, records kind `custom-avatars`) and keeps a copy on this device, so
// the made face shows at once too. The copy is checked again when read: odd data is ignored
// and the starting face shows until the account answers.
import { useSyncExternalStore } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { type AvatarConfig, avatarConfigSchema, defaultAvatarConfig } from "../../../packages/domain/src/avatar";
import { type CharacterId, characterOrDefault, characters, defaultCharacter } from "./debo-characters";

const KEY = "debo.character";
const CUSTOM_KEY = "debo.customAvatar";

class CharacterStore {
  private current: CharacterId = defaultCharacter;
  private assistantName = characters[defaultCharacter].name;
  private custom: AvatarConfig = defaultAvatarConfig;
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
  getCustom = () => this.custom;

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
    if (save) void saveText(KEY, next);
    if (next === this.current) return;
    this.current = next;
    for (const listener of this.listeners) listener();
  };

  /** The face the person made and talks to. Only drawn while the character is "custom". */
  setCustom = (value: unknown, save = true) => {
    const parsed = avatarConfigSchema.safeParse(value);
    if (!parsed.success) return;
    const config = parsed.data;
    if (save) void saveText(CUSTOM_KEY, JSON.stringify(config));
    if (JSON.stringify(config) === JSON.stringify(this.custom)) return;
    this.custom = config;
    for (const listener of this.listeners) listener();
  };

  /** Loads the copies kept on this device. Called once, by the first face. */
  start() {
    if (this.started) return;
    this.started = true;
    void loadText(KEY).then((value) => value && this.set(value, false));
    void loadText(CUSTOM_KEY).then((raw) => {
      if (!raw) return;
      try {
        this.setCustom(JSON.parse(raw), false);
      } catch {
        // A broken copy is ignored; the account keeps the real one.
      }
    });
  }
}

export const deboCharacter = new CharacterStore();

/** The chosen character. Re-renders when the person picks another one. */
export function useDeboCharacter(): CharacterId {
  deboCharacter.start();
  return useSyncExternalStore(deboCharacter.subscribe, deboCharacter.getSnapshot, deboCharacter.getSnapshot);
}

/** The drawing data of the face the person made (the starting face until one is loaded). */
export function useCustomAvatar(): AvatarConfig {
  deboCharacter.start();
  return useSyncExternalStore(deboCharacter.subscribe, deboCharacter.getCustom, deboCharacter.getCustom);
}

/** What to call the assistant in labels and screen-reader text: the name the person set. */
export function useAssistantName(): string {
  deboCharacter.start();
  return useSyncExternalStore(deboCharacter.subscribe, deboCharacter.getName, deboCharacter.getName);
}

async function loadText(key: string): Promise<string | null> {
  try {
    return Platform.OS === "web" ? (globalThis.localStorage?.getItem(key) ?? null) : await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function saveText(key: string, value: string): Promise<void> {
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(key, value);
    else await SecureStore.setItemAsync(key, value);
  } catch {
    // The choice still applies until the app closes, and the account keeps it.
  }
}
