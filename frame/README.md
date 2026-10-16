# Wish Jar on a Frameo photo frame

This folder builds Wish Jar as a full-screen app for a Frameo photo frame. It
is a small WebView app with the web export of Wish Jar bundled inside, so it
runs offline and needs no server.

It follows the approach in
[wesbos/photo-frame-dashboard](https://github.com/wesbos/photo-frame-dashboard),
whose `dashboard/kiosk` app this one is based on.

## The frame

Steps below were worked out on this model. Other Frameo frames often have
different boards inside, so check yours against
[the wesbos device list](https://github.com/wesbos/photo-frame-dashboard/blob/main/docs/devices.md)
first.

| | |
|---|---|
| Listing | Frameo 10.1" WiFi Digital Picture Frame, 32 GB ([Amazon AU B0D1C11NQZ](https://www.amazon.com.au/dp/B0D1C11NQZ)) |
| Board | Frameo 10.1" 102K: Allwinner A33, `astar_xr819` |
| Fingerprint | `Allwinner/astar_xr819/astar-xr819:6.0.1/MOB30R/20260113:eng/test-keys` |
| Android | 6.0.1 (API 23), `ro.config.low_ram=true` |
| WebView | 106.0.5249.126 |
| Screen | 1280x800, density 160, landscape |
| RAM / storage | 1 GB / 26 GB free on `/data` |
| Root | Shipped setuid `su`. The syntax is `su 0 <cmd>`; `su -c` fails with `invalid uid/gid '-c'` |
| ADB | USB only by default. Network ADB after `adb tcpip 5555`, until the next reboot |

### Why a WebView app and not the native build

The native Expo build (SDK 57, React Native 0.86) needs Android 7 or newer, so
it won't install on Android 6. The web export runs in the frame's WebView 106
instead.

The app serves the export from `https://appassets.androidplatform.net/`, the
origin Android sets aside for an app's own files, so the page is HTTPS.

### Where the data is kept

On web, `expo-sqlite` normally keeps its database in the browser's file
storage (OPFS). WebView 106 doesn't have OPFS, and Android WebView never
allows cross-origin isolation, so `SharedArrayBuffer` doesn't exist either.
Out of the box the database fails to open and the app is a white screen.

`patches/expo-sqlite@57.0.4.patch` fixes this for any browser without OPFS.
There, the database lives in memory and is saved to IndexedDB on every commit
(`web/wa-sqlite/IndexedDBSnapshotVFS.js` in the patch). The app only uses the
async database API, which doesn't need `SharedArrayBuffer`. Browsers with OPFS
keep the original storage.

### Emoji

Android 6's emoji font stops at Unicode 8. On this frame, 17 of the 64 emoji
the app uses were blank boxes, among them 🫙 🧹 🪥 🧸 and 🦷.

The frame app bundles [Twemoji](https://github.com/mozilla/twemoji-colr)
(Mozilla's color font build, v0.7.0, Unicode 14). It adds `web/frame.css` to
every page it serves. That stylesheet registers Twemoji under the name
"Segoe UI", for emoji code points only. "Segoe UI" is in React Native Web's
system font stack, but this frame doesn't have it. So every emoji is drawn
with Twemoji, and the rest of the text still uses Roboto.

`build.sh` downloads the font, checks its SHA-256 and keeps it in
`frame/.cache`. Twemoji graphics are © Twitter, Inc and other contributors,
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). The font build is
by Mozilla under the Apache License 2.0.

### The frame's own SQLite

The frame's own Android SQLite (3.8.10) can't stand in: our migrations use
`unixepoch()` and UPSERT, which need SQLite 3.38 and 3.24.

### Photos from Frameo

The frame has no camera roll to pick a kid's or an icon's photo from, and the
photos are on the grown-ups' phones. So on the frame, Wish Jar picks from the
photos sent to it with the Frameo phone app, which already gets them to the
frame from anywhere, through Frameo's cloud.

Frameo saves the photos it receives in `/sdcard/frameo_files/media/`, with a
`.nomedia` file that keeps them out of Android's media index. Its captions and
senders are in its own Realm database, which only Frameo can read. The frame
app reads the folder directly, which needs Android's storage permission
(`READ_EXTERNAL_STORAGE`) and nothing else:

- `/frameo/photos` lists the newest 60 photos, skipping videos.
- `/frameo/photos/<name>?size=N` turns one upright (EXIF), crops it to the
  middle square and scales it to N px. The app keeps it at 512 px.
- `/frameo/photos/<name>?width=W&height=H` turns one upright and scales the
  whole photo to fit inside W×H px, for the slideshow below.

### Slideshow while nobody's using it

Wish Jar keeps the screen on, so on its own the frame would show Wish Jar all
day and never the family's photos. Handing over to Frameo's slideshow doesn't
work: Frameo can't open other apps, so a tap would leave the frame in Frameo.

So once nobody has touched the frame for 3 minutes, Wish Jar shows the photos
sent with Frameo itself (`src/photos/Slideshow.tsx`): the newest first, 15
seconds each, fading from one to the next. Along the bottom, each kid's card
shows their coins and the wish they're closest to, with its progress bar. A tap
anywhere goes back to the screen that was open.

The photo list is read again after each round, so a photo sent in the
meantime joins the next one. With no photos yet, or no permission to read them
(see [Adding photos from a phone](#7-adding-photos-from-a-phone)), Wish Jar
just stays on screen. The slideshow comes with the Frameo photo picker, so a
frame built with `FRAMEO_PHOTOS=0` has neither.

It's a build option of the frame app. `frame/build.sh` writes
`/frame/config.js`, which the app adds to every page, with
`window.wishJarFrame = { frameoPhotos: true }`, or `false` when built with
`FRAMEO_PHOTOS=0` (`src/photos/frameo.ts`). The web bundle is the same for
every build, so Wish Jar on phones and on the dev server picks photos the
usual way. (An `EXPO_PUBLIC_` variable would be baked into the bundle, and
Metro's cache would carry it over to the next build, whatever it's for.)

### The timezone

Frameo frames come set to a factory timezone; this one was on
`America/New_York`. Android only detects the timezone from a mobile network,
which the frame doesn't have. The clock itself syncs over Wi-Fi, but each
day's tasks start again at midnight in the frame's timezone
(`src/tasks/day.ts`), so with the wrong one, the ticks reset in the middle of
the kids' day.

Until a timezone has been set, the frame app looks it up from the frame's IP
address each time Wish Jar comes to the front, with
[ipwho.is](https://ipwhois.io/) (free, no key), and sets it. That's the only
reason it has Android's `INTERNET` permission. On the grown-ups' screens, the
frame gets a **Timezone** row to pick another, for when the lookup guessed
wrong (on a VPN, say). Once one is picked there, the lookup never runs again.

Setting the timezone needs root: Android only lets system apps do it. The app
runs `su 0 service call alarm 3 s16 <zone>`, which works because this frame's
`su` lets any app use it and SELinux is permissive. To set it by hand:

```bash
adb shell su 0 service call alarm 3 s16 Australia/Brisbane
```

## Step by step

### 1. Turn on ADB on the frame

On the frame, in the Frameo app: **Settings → About → Beta Program → ADB
Access**, on.

### 2. Connect over USB

Use a **USB-A to USB-C data cable**. These frames often won't connect over
USB-C to USB-C, and the cable in the box may be power-only.

Install [Android platform-tools](https://developer.android.com/tools/releases/platform-tools),
then:

```bash
adb devices                       # the frame should be listed as "device"
adb shell getprop ro.build.fingerprint
adb shell getprop ro.build.version.release
adb shell getprop ro.board.platform
adb shell su 0 id                 # uid=0(root): the shipped su works
adb shell dumpsys package com.android.webview | grep versionName
```

If `adb devices` says `unauthorized` and no prompt appears on the frame, turn
ADB Access off and on again with the cable connected.

### 3. Switch to network ADB (optional)

So a computer without a USB connection to the frame can take over:

```bash
adb shell ip -4 addr show wlan0   # the frame's IP
adb tcpip 5555
adb connect <frame-ip>:5555
```

This lasts until the frame reboots. Anyone on your network can then reach root
ADB on the frame, so turn it off when you're done (`adb usb`, or reboot).

### 4. Build the app

You need JDK 17 and Android build-tools 34 with platform 34. No Gradle and no
Android Studio:

```bash
sdkmanager --sdk_root="$ANDROID_HOME" "build-tools;34.0.0" "platforms;android-34"
```

Then, from the project root:

```bash
JAVA_HOME=/path/to/jdk-17 ANDROID_HOME=/path/to/sdk frame/build.sh
```

The script exports the web build into the APK and signs it with
`~/.android/debug.keystore` (or `KEYSTORE`), creating that key if it's
missing. The result is `frame/build/wish-jar-frame.apk`.

The photo buttons pick from the photos sent to the frame with Frameo (see
[Photos from Frameo](#photos-from-frameo)). On a device without Frameo, build
with `FRAMEO_PHOTOS=0` to keep Android's usual file picker:

```bash
FRAMEO_PHOTOS=0 JAVA_HOME=/path/to/jdk-17 ANDROID_HOME=/path/to/sdk frame/build.sh
```

**Keep that keystore.** An update signed with a different key won't install
over the old one. The app would have to be uninstalled first, and that
deletes the kids, tasks and savings stored on the frame.

### 5. Install and start it

```bash
adb install -r frame/build/wish-jar-frame.apk
adb shell am start -n com.wishjar.frame/.MainActivity
```

Frameo is the frame's home screen, and it has no app list and no way to open
another app. Once the frame is in Frameo, Wish Jar only comes back if
something starts it: the `am start` above, or Wish Jar's own return trip after
*Connect a phone* (step 7).

### 6. Using it on the frame

- The app is full screen with no navigation bar. To get out, **hold two
  fingers still on the screen for 1.5 seconds**. A menu opens with *Open
  Frameo*, *Android settings* and *Reload Wish Jar*. *Open Frameo* warns
  first: the frame stays in Frameo until Wish Jar is started again over ADB.
- To debug the page from Chrome DevTools, start it with remote debugging on.
  Any normal launch turns it off again.

  ```bash
  adb shell am start -n com.wishjar.frame/.MainActivity --ez debug true
  # Android 6's pidof lists every process, so find the DevTools socket instead
  adb forward tcp:9222 localabstract:$(adb shell grep -o 'webview_devtools_remote_[0-9]*' /proc/net/unix | tr -d '\r' | head -1)
  # then open chrome://inspect, or http://localhost:9222/json
  ```

### 7. Adding photos from a phone

1. Send the photo to the frame with the Frameo app on your phone, the usual
   way. It also goes into the frame's slideshow. Delete it there once you've
   picked it if you don't want it in the slideshow; Wish Jar keeps its own
   copy.
2. On the frame, open the grown-ups' screens and tap a photo button: the kid's
   photo, or *Pick a photo sent with Frameo* for a task, wish or punishment.
   The newest photos come first, and one sent while the list is open shows
   up within a few seconds.

The first time, Android asks whether Wish Jar may access photos, media and
files: tap **Allow**. If it was denied for good, turn on *Storage* in Android
settings → Apps → Wish Jar → Permissions, or from a computer:

```bash
adb shell pm grant com.wishjar.frame android.permission.READ_EXTERNAL_STORAGE
```

#### Connecting a new phone

A phone can only send to the frame once it's a Frameo friend, which takes a
code from the frame. In the photo picker, tap **Connect a phone**. Frameo
opens: choose *Add friend*, and type the code it shows into the Frameo app on
the phone. Then send a photo.

Wish Jar comes back by itself as soon as that photo arrives, or after 5
minutes if none does (`ReturnReceiver`: an alarm that checks Frameo's folder
every 15 seconds). If Android stopped Wish Jar while Frameo was open, which
low-RAM mode allows, it reopens on the start screen rather than the picker;
open the picker again and the photo is first.

### 8. Updating

Run `frame/build.sh` again, then `adb install -r`. The data stays as long as
you use the same keystore.

## Things to know

- **The keyboard.** A full-screen Android window isn't resized for the
  keyboard, so the keyboard would cover the field you're typing in. The app
  shrinks the page to the space above the keyboard instead
  (`MainActivity.fitAboveKeyboard`), and WebView scrolls the field into view.
- **No text selection.** WebView turns a long press into a text selection,
  which would swallow the long press on the 🔒. `web/frame.css` turns
  selection off everywhere except text fields.

- **The frame keeps its own data.** Wish Jar stores everything locally, so the
  frame doesn't share kids, tasks or savings with the app on a phone.
- **Don't uninstall the app** unless you mean to wipe its data. The same goes
  for *Clear data* in Android settings.
- **Low-RAM mode.** This frame runs with `ro.config.low_ram=true`, so Android
  may kill Wish Jar when you switch to another app. Data is saved as you go,
  and the app reopens on the start screen.
