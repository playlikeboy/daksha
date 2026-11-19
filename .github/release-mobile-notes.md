Early test build of the Daksha phone app. It talks to the live Daksha at https://api.daksha.life, so it uses the same account and data as https://my.daksha.life.

## Android (`daksha.apk`)

- Install it by hand: download `daksha.apk` (`debo.apk` is the same file under its old name), open it on an Android phone, and allow installs from your browser or file app when Android asks. It is not on Google Play.
- It is test-signed with a debug key, not a release key. Android may warn about it. A later build can update this one only if it is signed with the same key.
- It is built for 64-bit and 32-bit ARM phones. It does not run on a PC emulator (x86).
- It installs over an earlier Debo build: the app id is still `life.debo.app`, only the name on the phone changed.
- Nobody has run this build on a real phone yet. Sign-in from a phone, talking to Daksha by voice, uploading files and reading PDFs are built, but not checked on a device.

## iPhone

- There is no iPhone app yet. An installable iPhone build needs a paid Apple Developer account, which the project does not have yet.
- Daksha works in the phone browser at https://my.daksha.life. In Safari, tap Share, then Add to Home Screen.
- If `debo-__VERSION__-ios-simulator.zip` is attached, it is an unsigned build for the iOS Simulator on a Mac, for developers. It cannot be installed on an iPhone.

Privacy: https://daksha.life/privacy
