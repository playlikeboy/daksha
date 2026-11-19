# Daksha app (mobile)

This is the Daksha app: https://my.daksha.life on the web, and the Android and iOS builds described under [Phone builds and releases](#phone-builds-and-releases). The package is still named `@openfuse/mobile` because the app started from CopilotKit's OpenFuse template.

A shared React Native workspace for iOS, Android, and the web preview. The client uses native primitives and the CopilotKit headless hooks; the web preview renders those same screens through React Native Web.

## Demos

[Recording setup](../../docs/DEMO.md)

Meet OpenFuse's capybara in two different journeys: Hacker News and CopilotKit on iPhone; reading a school-trip email and researching aquarium exhibits on desktop. Results appear inline in chat, with **Take control** opening the same browser session. Send and Stop share the input pill's primary control.

## Run

Start the API from the repository root, then:

```sh
pnpm --dir apps/mobile web
pnpm --dir apps/mobile ios
pnpm --dir apps/mobile android
```

The default API is `http://localhost:8787`, or `http://10.0.2.2:8787` on the Android emulator. Set `EXPO_PUBLIC_API_URL` to your reachable server URL for a physical device or deployment. Live mode asks for the server access key; local mode opens the fictional workspace automatically. Tokens stay in memory.

PDFs use `react-native-pdf` and `react-native-blob-util` in an Expo **development build**. Expo Go does not include these native modules. The config plugins in `app.json` configure the native projects. Web uses the browser’s real PDF reader, with page/zoom controls and download/print access. PDF form fields save a new server artifact.

## Checks

```sh
pnpm --dir apps/mobile typecheck
node --experimental-strip-types --test apps/mobile/test/date-time.test.ts
pnpm --dir apps/mobile build:web
pnpm --dir apps/mobile build:ios
pnpm --dir apps/mobile build:android
```

The `build:ios` and `build:android` commands validate and export platform JavaScript/Hermes bundles. They do not create signed installable apps. `ios` and `android` run Expo’s native development-build workflows and need the platform toolchains.

## Installing the web app

`public/` is copied as is into the web export. It holds `manifest.webmanifest` (name, `display: standalone`, `start_url` and `scope` `/`, icons, screenshots), the icons, `og.png` and a `_headers` file for Cloudflare. `public/index.html` is Expo's page template: it links the manifest and icons, sets the theme colour and iPhone home screen tags, and stops Chrome's own install bar (`beforeinstallprompt`). Without a manifest Chrome only makes a shortcut, which opens as a normal tab with the address bar. Daksha shows no install prompt of its own. The menu has a quiet "Get the app" row that opens the landing page's download section, and hides it in the installed app and the phone builds (`src/get-app.ts`).

Make the icons and install screenshots again with `node scripts/icons/build-icons.mjs`, and the share picture with `node scripts/og/build-og.mjs` (both from the repo root).

## Phone builds and releases

The workflow [`.github/workflows/release-mobile.yml`](../../../.github/workflows/release-mobile.yml) builds the phone apps in GitHub Actions, because building needs the Android SDK (and Xcode for iOS). Each build runs `expo prebuild` (the `android/` and `ios/` folders are generated and not committed) with `EXPO_PUBLIC_API_URL=https://api.daksha.life`.

| Trigger | What happens |
|---|---|
| Push of a tag `v*` | Builds Android and the iOS Simulator app, then publishes a GitHub Release with the files |
| Manual run, or a push to the `mobile-release` branch | Builds both and keeps them as run artifacts. No release. |

**Automatic builds:** every push to `main` that changes `os/apps/mobile`, `os/packages`, `os/pnpm-lock.yaml` or the workflow builds both apps and publishes a release tagged `v<version>-build.<run number>`, marked as the latest, so the download link always gives the newest APK. Its Android `versionCode` is the run number plus one, so a newer build installs over an older one (as long as both are signed with the same key).

**To release a named version:** set the version in `app.json` (`expo.version`), merge to `main`, then push a tag with the same number, for example `git tag v0.1.0 && git push origin v0.1.0`. The release is a normal release, not a pre-release, on purpose: the landing page links to `https://github.com/playlikeboy/daksha/releases/latest/download/debo.apk`, and GitHub's `latest` address skips pre-releases. The notes come from [`.github/release-mobile-notes.md`](../../../.github/release-mobile-notes.md).

### Android

- Files: `debo-<version>.apk` and `debo.apk` (the same file; the second name keeps the download link stable). Built for `arm64-v8a` and `armeabi-v7a` (phones), not x86.
- **It is test-signed.** `expo prebuild`'s template signs the release build with its debug keystore, and the workflow leaves that alone unless the four secrets below exist. A debug-signed APK is fine to install by hand, but Google Play refuses it, and a build signed with a different key cannot update it (the person has to uninstall first).
- **For a real signing key** the owner creates an upload keystore and adds these repository secrets: `ANDROID_KEYSTORE_BASE64` (the keystore file, base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The workflow then passes them to Gradle as `android.injected.signing.*` properties. That path has not been run (no key exists yet). Play Store upload also needs an `.aab` (`bundleRelease`) and a rising `versionCode`, neither of which the workflow does yet; `versionCode` is 1 in every build.
- Install by hand: download `debo.apk` on the phone, open it, allow installs from that app when Android asks.
- What needs native code, and where it is set up: recording voice notes and videos (`expo-audio`, `expo-camera`; see [`os/docs/JOURNAL-MEDIA.md`](../../docs/JOURNAL-MEDIA.md#phone-ios-and-android)), Talk calls (LiveKit), a Talk call that keeps going in the background with a "Daksha is listening" notification (`@supersami/rn-foreground-service`, set up by the local config plugin [`plugins/with-call-service.js`](plugins/with-call-service.js); see [`docs/VOICE.md`](../../../docs/VOICE.md)), and local reminder notifications (`expo-notifications`, not used by a screen yet). A build made before one of these was added does not have it: install the newest APK.
- Permissions the app asks for, each only when it is needed: the microphone (a call or a voice note), the camera (a video note), and on Android 13 and later notifications (when a call starts, so "Daksha is listening" can show).
- Not run on a real phone by anyone yet. Sign-in on a phone is described in [`docs/AUTH.md`](../../docs/AUTH.md#sign-in-on-a-phone).

### iPhone

- The workflow makes an **unsigned build for the iOS Simulator** (`debo-<version>-ios-simulator.zip`, a zipped `Daksha.app`). It runs only in the Simulator on a Mac (`xcrun simctl install booted Daksha.app`). It cannot be installed on an iPhone.
- An installable iPhone build (TestFlight or the App Store) needs things only the owner can provide: a paid Apple Developer Program membership, an App ID `life.debo.app`, a distribution certificate and provisioning profile (or an App Store Connect API key with Expo EAS or fastlane managing them), an app record in App Store Connect with its name, icon, screenshots and privacy answers, and an iPhone to test on. Then the workflow would build a signed `.ipa` and upload it; that is not written yet.
- Until then, iPhone users use https://my.daksha.life in Safari with Share, then Add to Home Screen.

## Behavior

- Chat, Activity, Ideas, Goals and Apps are the primary navigation. Tasks, timelines and notifications refresh from the durable server state. Apps contains Mail, Calendar, Browser, Files and Connections.
- Drafts are saved in OpenFuse and can be reopened from Mail. Mail attachments import into Files before reading.
- Calendar edits preserve named time zones. Date entry rejects nonexistent times at daylight-saving transitions.
- Sending mail and creating, changing, or deleting events require a stored proposal and an explicit review decision. Editing a proposal declines the previous version, then opens a new draft.
- Chat restores/saves AG-UI conversation messages, renders frontend tool cards, and supports interruption, retry, and document references.
- While the agent replies, the send arrow becomes a stop square in the same input pill. Stop preserves the draft; the arrow returns when the run ends. A new message can continue immediately after stopping when no follow-ups are waiting. Held follow-ups resume through **Send queued messages**.
- Browser previews and consoles use only signed worker URLs returned by the API. PDF downloads import through the worker API.
- Google connects through the system browser. Refresh the workspace after completing OAuth.

Phone and wide layouts share Chat, Activity, Ideas, Goals and Apps. The task and notification sheets restore server state when reopened. Document and browser viewers have platform-specific files; presentation and state remain shared.
