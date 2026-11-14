Early test build of the Debo phone app. It talks to the live Debo at https://api.debo.life, so it uses the same account and data as https://my.debo.life.

## Android (`debo.apk`)

- Install it by hand: download `debo.apk`, open it on an Android phone, and allow installs from your browser or file app when Android asks. It is not on Google Play.
- It is test-signed with a debug key, not a release key. Android may warn about it. A later build can update this one only if it is signed with the same key.
- It is built for 64-bit and 32-bit ARM phones. It does not run on a PC emulator (x86).
- Nobody has run this build on a real phone yet. Sign-in from a phone, talking to Debo by voice, uploading files and reading PDFs are built, but not checked on a device.

## iPhone

- There is no iPhone app yet. An installable iPhone build needs a paid Apple Developer account, which the project does not have yet.
- Debo works in the phone browser at https://my.debo.life. In Safari, tap Share, then Add to Home Screen.
- If `debo-__VERSION__-ios-simulator.zip` is attached, it is an unsigned build for the iOS Simulator on a Mac, for developers. It cannot be installed on an iPhone.

Privacy: https://debo.life/privacy
