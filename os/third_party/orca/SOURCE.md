# Orca's on-device speech module: copied, not wired yet

Repository: https://github.com/stablyai/orca
Commit: 29bb3043bdc02e18fac98f5888ccdeaf931faa38
License: MIT


- **Repo:** https://github.com/stablyai/orca (MIT, see `LICENSE` here)
- **Commit:** `29bb3043bdc02e18fac98f5888ccdeaf931faa38`
- **Copied:** `mobile/packages/expo-two-way-audio/` in full, unchanged, as `expo-two-way-audio/`. That package keeps its own `LICENSE` (MIT, Cantab Research, the module's original authors).
- **Wired:** no. Nothing imports it. It is outside the pnpm workspace and Expo's autolinking, so the app builds exactly as before.

## What it does

The module captures echo-cancelled 16 kHz mono PCM from the microphone, and turns speech into text on the phone:
- On iOS 26 it uses `SpeechTranscriber`, and falls back to the keyboard dictation model on older phones.
- On Android it uses ML Kit GenAI speech recognition, and falls back to the platform recogniser.

Daksha could use it for dictation and for a call mode where the words never leave the phone.

## Why it is parked

- It is built against `expo-modules-core ~58` and `expo-module-scripts ^56`. Orca runs Expo SDK 58 and React Native 0.88. Daksha's app is on Expo SDK 54 and React Native 0.81.
- The iOS code needs the iOS 26 SDK (Xcode 26) for `SpeechTranscriber`.
- The Android code needs `com.google.mlkit:genai-speech-recognition:1.0.0-alpha1`, an alpha library.
- There is no native toolchain in this environment to build or test it.

## Upgrade note: what wiring it needs

1. Move the app to Expo SDK 58. That is a separate, app-wide upgrade: React Native 0.88, React 19.2, and each Expo package's migration notes. Run it through EAS builds on real devices.
2. Move this folder to `os/apps/mobile/modules/expo-two-way-audio` (Expo's local-module path), or add it to the pnpm workspace. Then rename the package to `@debo/expo-two-way-audio`.
3. Set the iOS deployment target and Xcode to 26 for the `SpeechTranscriber` path, and keep the dictation fallback for older phones.
4. Decide whether an alpha ML Kit library is acceptable on Android. If not, remove `MlKitSpeechEngine.kt` and keep `PlatformSpeechEngine.kt`.
5. Add the microphone and speech-recognition permission strings to `app.json` (`NSMicrophoneUsageDescription`, `NSSpeechRecognitionUsageDescription`).
6. Wire it behind a setting such as "Turn my speech into text on this phone". When it is on, the voice screen sends text instead of audio. The privacy page then says audio does not leave the phone in that mode.

## Copied

See the list at the top of this file.

## Changed

Nothing. The copy is unchanged and not wired yet.
