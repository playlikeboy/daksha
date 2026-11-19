// Expo config plugin: lets a Talk call keep going on Android while Daksha is in
// the background. It sets up @supersami/rn-foreground-service the way Daksha
// uses it (see src/debo-call-service.native.ts):
//
// - declares its service with foregroundServiceType "microphone", which
//   Android 14 and later require for a service that uses the microphone, and
//   stopWithTask, so swiping Daksha away from the recent apps ends the call;
// - names the notification channel in plain words ("Talking with Daksha");
// - removes a stray example activity the library's own manifest adds;
// - makes the app's MainActivity pass a press of the notification's End button
//   to the app (the library expects its own MainActivity to do this).
//
// The permissions (FOREGROUND_SERVICE, FOREGROUND_SERVICE_MICROPHONE,
// POST_NOTIFICATIONS, RECORD_AUDIO) are listed in app.json.
const { AndroidConfig, withAndroidManifest, withMainActivity } = require("expo/config-plugins");

const SERVICE = "com.supersami.foregroundservice.ForegroundService";
const STRAY_ACTIVITY = "com.supersami.foregroundservice.MainActivity";
const META = {
  "com.supersami.foregroundservice.notification_channel_name": "Talking with Daksha",
  "com.supersami.foregroundservice.notification_channel_description":
    "Shows while you are talking with Daksha, with a button to end the call.",
};
const MARKER = "// Daksha: the End button on the call notification.";

/** Add the service, the channel names and the activity removal to a parsed AndroidManifest. */
function addCallService(manifest) {
  manifest.manifest.$ = manifest.manifest.$ ?? {};
  manifest.manifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);

  app.service = (app.service ?? []).filter((item) => item.$["android:name"] !== SERVICE);
  app.service.push({
    $: {
      "android:name": SERVICE,
      "android:exported": "false",
      "android:foregroundServiceType": "microphone",
      "android:stopWithTask": "true",
    },
  });

  for (const [name, value] of Object.entries(META)) {
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, name, value);
  }

  app.activity = (app.activity ?? []).filter((item) => item.$["android:name"] !== STRAY_ACTIVITY);
  app.activity.push({ $: { "android:name": STRAY_ACTIVITY, "tools:node": "remove" } });
  return manifest;
}

const KOTLIN = `
  ${MARKER}
  // The library opens this activity with "buttonOnPress" set; the app listens for this event.
  override fun onNewIntent(intent: android.content.Intent) {
    super.onNewIntent(intent)
    val pressed = intent.getStringExtra("buttonOnPress") ?: return
    val event = com.facebook.react.bridge.Arguments.createMap()
    event.putString("button", pressed)
    (application as com.facebook.react.ReactApplication).reactHost?.currentReactContext
      ?.emitDeviceEvent("notificationClickHandle", event)
  }
`;

/** Add onNewIntent to the generated Kotlin MainActivity, once. */
function addEndButtonHandler(source) {
  if (source.includes(MARKER)) return source;
  if (/override fun onNewIntent/.test(source)) {
    throw new Error("with-call-service: MainActivity already has onNewIntent. Merge the End button handler by hand.");
  }
  const end = source.lastIndexOf("}");
  if (end === -1) throw new Error("with-call-service: MainActivity.kt has no class body.");
  return `${source.slice(0, end).trimEnd()}\n${KOTLIN}}\n`;
}

function withCallService(config) {
  config = withAndroidManifest(config, (next) => {
    next.modResults = addCallService(next.modResults);
    return next;
  });
  return withMainActivity(config, (next) => {
    if (next.modResults.language !== "kt") {
      throw new Error("with-call-service: expected a Kotlin MainActivity.");
    }
    next.modResults.contents = addEndButtonHandler(next.modResults.contents);
    return next;
  });
}

module.exports = withCallService;
module.exports.addCallService = addCallService;
module.exports.addEndButtonHandler = addEndButtonHandler;
