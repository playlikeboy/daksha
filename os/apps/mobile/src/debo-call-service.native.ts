// Android: keep a Talk call going while Debo is in the background.
//
// Android stops an app from using the microphone once it is out of sight,
// unless the app runs a "foreground service" of type microphone, which must
// show a notification the whole time. So while a call is live, this shows
// "Debo is listening" with an End button, and the call keeps going when the
// person switches apps or turns the screen off. It stops the moment the call
// ends. iPhone needs none of this: the "audio" background mode in app.json
// keeps the call going there.
//
// The service comes from @supersami/rn-foreground-service. Its native module is
// called directly: the library's JavaScript wrapper also runs a background task
// loop Debo does not need. The service declaration and the End button wiring
// are made by plugins/with-call-service.js.
//
// Not run on a device yet: typechecked, and the Android build is made by CI.
import { DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";
import { colors } from "./palette";

type ForegroundServiceModule = {
  startService(config: Record<string, unknown>): Promise<void>;
  stopServiceAll(): Promise<void>;
};

const NOTIFICATION_ID = 4071;
const END_PRESSED = "debo-end-call";

function serviceModule(): ForegroundServiceModule | undefined {
  if (Platform.OS !== "android") return undefined;
  return (NativeModules as { ForegroundService?: ForegroundServiceModule }).ForegroundService;
}

/**
 * Android 13 and later hide the notification unless the person allows
 * notifications. Ask when a call starts, since that is when it is shown. If the
 * answer is no, the call still keeps going; Android then lists it under its
 * active apps instead.
 */
async function askToShowNotification() {
  if (Platform.OS !== "android" || Number(Platform.Version) < 33) return;
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(permission)) return;
  await PermissionsAndroid.request(permission).catch(() => undefined);
}

/**
 * Start the service for a live call. `onEnd` runs when the End button on the
 * notification is pressed. Returns a function that stops the service.
 * Does nothing (and never throws) where there is no service: iPhone, the web,
 * or a build made before the service was added.
 */
export async function keepCallRunning(onEnd: () => void): Promise<() => Promise<void>> {
  const service = serviceModule();
  if (!service) return async () => {};
  const subscription = DeviceEventEmitter.addListener("notificationClickHandle", (event: { button?: string }) => {
    if (event?.button === END_PRESSED) onEnd();
  });
  await askToShowNotification().catch(() => undefined);
  try {
    await service.startService({
      id: NOTIFICATION_ID,
      title: "Debo is listening",
      message: "You are in a call with Debo. Press End to hang up.",
      ServiceType: "microphone",
      ongoing: true,
      importance: "low",
      visibility: "public",
      icon: "ic_launcher",
      largeIcon: "ic_launcher",
      color: colors.accent,
      button: true,
      buttonText: "End",
      buttonOnPress: END_PRESSED,
      mainOnPress: "open",
    });
  } catch {
    // The call still works while Debo is on screen.
  }
  return async () => {
    subscription.remove();
    await service.stopServiceAll().catch(() => undefined);
  };
}
