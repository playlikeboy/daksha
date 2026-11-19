// Has this person already read the Talk consent text on this device?
//
// The microphone must never start without the person knowing. The first time on a
// device the popup shows the plain-words text and waits for "Start talking". Once they
// have pressed it, pressing Daksha's face at the top of the app can start the call
// straight away. The choice is kept on this device only (browser storage or the phone's
// secure store), never sent anywhere.
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const KEY = "debo.talk-consent";

let agreed: boolean | undefined;
let autoStart = false;

export async function hasAgreedToTalk(): Promise<boolean> {
  if (agreed !== undefined) return agreed;
  try {
    const raw =
      Platform.OS === "web"
        ? (globalThis.localStorage?.getItem(KEY) ?? null)
        : await SecureStore.getItemAsync(KEY);
    agreed = raw === "yes";
  } catch {
    agreed = false;
  }
  return agreed;
}

export async function rememberAgreedToTalk(): Promise<void> {
  agreed = true;
  try {
    if (Platform.OS === "web") globalThis.localStorage?.setItem(KEY, "yes");
    else await SecureStore.setItemAsync(KEY, "yes");
  } catch {
    // It still holds until the app closes.
  }
}

/** The header asks the popup to start the call as soon as it opens (only if they agreed before). */
export function requestTalkAutoStart(): void {
  autoStart = true;
}

/** The popup reads the request once. */
export function takeTalkAutoStart(): boolean {
  const asked = autoStart;
  autoStart = false;
  return asked;
}
