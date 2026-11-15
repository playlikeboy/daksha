import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

// The config plugin is plain CommonJS (Expo loads it with require).
const require = createRequire(import.meta.url);
type Item = { $: Record<string, string> };
type Manifest = {
  manifest: { $?: Record<string, string>; application?: Array<Item & { service?: Item[]; activity?: Item[]; "meta-data"?: Item[] }> };
};
const plugin = require("../plugins/with-call-service.js") as {
  addCallService(manifest: Manifest): Manifest;
  addEndButtonHandler(source: string): string;
};

const freshManifest = (): Manifest => ({
  manifest: {
    $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
    application: [{ $: { "android:name": ".MainApplication" }, activity: [{ $: { "android:name": ".MainActivity" } }] }],
  },
});

test("the call service is declared as a microphone service that stops with the app", () => {
  const app = plugin.addCallService(freshManifest()).manifest.application?.[0];
  const service = app?.service?.find((s) => s.$["android:name"] === "com.supersami.foregroundservice.ForegroundService");
  assert.equal(service?.$["android:foregroundServiceType"], "microphone");
  assert.equal(service?.$["android:exported"], "false");
  assert.equal(service?.$["android:stopWithTask"], "true");
  const channel = app?.["meta-data"]?.find(
    (m) => m.$["android:name"] === "com.supersami.foregroundservice.notification_channel_name",
  );
  assert.equal(channel?.$["android:value"], "Talking with Debo");
});

test("the library's example activity is removed, and the app's own activity stays", () => {
  const manifest = plugin.addCallService(freshManifest());
  const activities = manifest.manifest.application?.[0]?.activity ?? [];
  assert.ok(activities.some((a) => a.$["android:name"] === ".MainActivity" && !a.$["tools:node"]));
  const stray = activities.find((a) => a.$["android:name"] === "com.supersami.foregroundservice.MainActivity");
  assert.equal(stray?.$["tools:node"], "remove");
  assert.equal(manifest.manifest.$?.["xmlns:tools"], "http://schemas.android.com/tools");
});

test("running the plugin twice does not declare the service twice", () => {
  const twice = plugin.addCallService(plugin.addCallService(freshManifest()));
  const app = twice.manifest.application?.[0];
  assert.equal(app?.service?.length, 1);
  assert.equal(app?.activity?.length, 2);
});

test("MainActivity gets one End button handler", () => {
  const source = "package life.debo.app\n\nclass MainActivity : ReactActivity() {\n  override fun getMainComponentName(): String = \"main\"\n}\n";
  const once = plugin.addEndButtonHandler(source);
  assert.match(once, /override fun onNewIntent\(intent: android.content.Intent\)/);
  assert.match(once, /emitDeviceEvent\("notificationClickHandle", event\)/);
  assert.ok(once.trimEnd().endsWith("}"));
  assert.equal(plugin.addEndButtonHandler(once), once);
});
