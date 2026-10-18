# Wish Jar on a Frameo photo frame

This folder builds Wish Jar as a full-screen app for a Frameo photo frame. It
is a small WebView app that opens the online site,
`https://wish-jar.blastin.dev/?host=frameo`, as the Echo Show does. Each
deploy of the site reaches the frame the next time the page loads, so the app
only needs installing again when its own Java code changes (WJ-69). The frame
needs Wi-Fi.

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

`?host=frameo` tells the page it runs on the frame (`apps/mobile/src/device/host.ts`), and
sessionStorage keeps that for the WebView's session, so moving between screens
(which drops the query) keeps it.

Until WJ-69 the app bundled the web export and served it from
`https://appassets.androidplatform.net/`. That origin is shared by every
Android app's own pages, so it's no longer on the Turnstile widget or the
API's `ALLOWED_ORIGINS` (apps/api/README.md).

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

The site serves [Twemoji](https://github.com/mozilla/twemoji-colr)
(Mozilla's color font build, v0.7.0, Unicode 14) from `public/fonts`, and on
the frame the page always registers it under the name "Segoe UI", for emoji
code points only (`apps/mobile/src/theme/emojiFallback.web.ts`). "Segoe UI" is in React
Native Web's system font stack, but this frame doesn't have it. So every emoji
is drawn with Twemoji, and the rest of the text still uses Roboto.

Twemoji graphics are © Twitter, Inc and other contributors,
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). The font build is
by Mozilla under the Apache License 2.0.

### The frame's own SQLite

The frame's own Android SQLite (3.8.10) can't stand in: our migrations use
`unixepoch()` and UPSERT, which need SQLite 3.38 and 3.24.

### Photos

The frame has no camera and no photos of its own to pick a kid's or an icon's
photo from, so it gets them the way the Echo Show does: a photo button shows a
QR code (and a short code to type), a grown-up opens it on their phone and
sends a photo, and it goes through the API into the family jar
(`apps/mobile/src/photos/PhonePhotoSheet.tsx`). Like every other device's photos, it then
shows on all the family's devices. The Frameo phone app isn't involved, and
Wish Jar doesn't read the photos Frameo receives.

### Slideshow while nobody's using it

Wish Jar keeps the screen on, so on its own the frame would show Wish Jar all
day. Handing over to Frameo's slideshow doesn't work: Frameo can't open other
apps, so a tap would leave the frame in Frameo.

So once nobody has touched the frame for 3 minutes, Wish Jar shows the family
jar's photos of the kids and their wishes itself (`apps/mobile/src/photos/Slideshow.tsx`):
the newest first, 15 seconds each, whole on black, fading from one to the
next. Swiping left or right goes to the next or previous photo. Along the
bottom, each kid's card shows their coins and the wish they're closest to,
with its progress bar. A double tap anywhere goes back to the screen that was
open; a single tap does nothing, so brushing the frame doesn't end the
slideshow.

The photo list is read again after each round, so a photo added in the
meantime joins the next one. With no photos yet, Wish Jar just stays on
screen.

The page knows it's on the frame from `?host=frameo` (`apps/mobile/src/device/host.ts`).
The web bundle is the same for every device, so Wish Jar on phones and on the
dev server picks photos the usual way.

### The timezone

Each day's tasks start again at midnight in the frame's timezone
(`apps/mobile/src/tasks/day.ts`), and Frameo's sleep schedule follows the frame's clock
too. Frameo frames come set to a factory timezone (this one was on
`America/New_York`), and Android only detects the timezone from a mobile
network, which the frame doesn't have. With the wrong one, the ticks reset and
the screen goes to sleep in the middle of the kids' day.

Set it in Frameo, which keeps its own timezone and puts it back on every boot:

1. Hold two fingers still on Wish Jar for 1.5 seconds and choose *Open
   Frameo*. (Or do this before starting Wish Jar the first time.)
2. In Frameo, open **Settings → My frame → Time zone** and pick yours, for
   example *Brisbane*.
3. Check **Settings → My frame → Time** shows the right time. Frameo sets the
   date and time itself over the internet.
4. Bring Wish Jar back with `adb shell am start -n com.wishjar.frame/.MainActivity`,
   or restart the frame.

The page follows the frame's timezone the next time it loads, so after
changing it, choose *Reload Wish Jar* from the two-finger menu.

Until WJ-69 the frame app set the timezone itself, through root, and set it
again after Frameo put its own back at boot. Frameo's own setting does the
same without root, so that's gone.

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
JAVA_HOME=/path/to/jdk-17 ANDROID_HOME=/path/to/sdk apps/frame/build.sh
```

The script compiles the Java code into an APK and signs it with
`~/.android/debug.keystore` (or `KEYSTORE`), creating that key if it's
missing. The result is `apps/frame/build/wish-jar-frame.apk`. The site isn't in the
APK, so no Turnstile site key or web export is needed.

**Keep that keystore.** An update signed with a different key won't install
over the old one. The app would have to be uninstalled first, and that
deletes the frame's place in the family jar, so it has to join again with a
code.

### 5. Install and start it

```bash
adb install -r apps/frame/build/wish-jar-frame.apk
adb shell am start -n com.wishjar.frame/.MainActivity
```

Frameo is the frame's home screen, and it has no app list and no way to open
another app. Once the frame is in Frameo, Wish Jar only comes back if
something starts it: the `am start` above, or a restart of the frame.

#### After a restart

When the frame restarts, Frameo comes up first, as its home screen, and Wish
Jar then opens by itself in front of it. Frameo's own boot steps can bring it
back to the front, so for the next 2 minutes Wish Jar checks again and reopens
if it isn't in front. Choosing *Open Frameo* or *Android
settings* from the two-finger menu stops those checks.

This frame's firmware doesn't send Android's "boot completed" signal to Wish
Jar: Allwinner's `BackgroundManagerService` only sends it to the apps on a
list built into the system image (`boot_completed_broadcast_whitelist`, with
Frameo on it), and no setting changes that list. So Wish Jar opens on the
signals that do reach it on every boot: the storage being mounted, or the
Wi-Fi connecting, whichever comes first in the first 10 minutes after the
frame starts. Once per boot only, so Wi-Fi dropping and coming back later in
the day doesn't pull Wish Jar in front of Frameo. You can see it in the log:

```bash
adb logcat -d -s WishJarFrame | grep -i boot
```

Android sends none of these to an app that has been force-stopped, until it is
opened again. Installing with `adb install -r` is fine, but run the `am start`
above after installing anyway.

### 6. Using it on the frame

- The app is full screen with no navigation bar. To get out, **hold two
  fingers still on the screen for 1.5 seconds**. A menu opens with *Open
  Frameo*, *Android settings* and *Reload Wish Jar*. *Open Frameo* warns
  first: the frame stays in Frameo until Wish Jar is started again over ADB, or
  the frame restarts.
- To debug the page from Chrome DevTools, start it with remote debugging on.
  Any normal launch turns it off again.

  ```bash
  adb shell am start -n com.wishjar.frame/.MainActivity --ez debug true
  # Android 6's pidof lists every process, so find the DevTools socket instead
  adb forward tcp:9222 localabstract:$(adb shell grep -o 'webview_devtools_remote_[0-9]*' /proc/net/unix | tr -d '\r' | head -1)
  # then open chrome://inspect, or http://localhost:9222/json
  ```

### 7. Adding photos from a phone

1. On the frame, open the grown-ups' screens and tap a photo button: *Send a
   photo from your phone*, for a kid, task, wish or punishment.
2. Scan the QR code with your phone (or open the address shown and type the
   code), then take or pick the photo there and send it.
3. The frame picks it up within a few seconds. The code runs out after
   10 minutes; tap *Get a new code* for another.

### 8. Updating

Wish Jar itself updates with every deploy of the site: the frame checks the
page each time it loads it (`public/_headers`), so it runs the new version
after the next restart, or straight away with *Reload Wish Jar* from the
two-finger menu.

Only a change to this folder's Java code needs a new APK: run `apps/frame/build.sh`
again, then `adb install -r` and the `am start` above.

A frame that had a build from before WJ-69 (which bundled the site) keeps its
old data in the old origin's storage, but the online site doesn't see it.
After installing this build, join the family jar once with a code from
another device (*Settings → Devices* there).

## Things to know

- **The keyboard.** A full-screen Android window isn't resized for the
  keyboard, so the keyboard would cover the field you're typing in. The app
  shrinks the page to the space above the keyboard instead
  (`MainActivity.fitAboveKeyboard`), and WebView scrolls the field into view.
- **No text selection.** WebView turns a long press into a text selection,
  which would swallow the long press on the 🔒. On the frame the page turns
  selection off everywhere except text fields (`apps/mobile/src/device/frame.ts`).

- **It needs the internet.** At boot, Wi-Fi often connects after Wish Jar has
  opened. Until the site loads, the app shows *Wish Jar is waiting for the
  internet…* and tries again when the network connects, and every 30 seconds
  (`MainActivity.retryLoad`).
- **Don't uninstall the app** unless you mean the frame to leave the family
  jar. The same goes for *Clear data* in Android settings. Either way it can
  join again with a code.
- **Low-RAM mode.** This frame runs with `ro.config.low_ram=true`, so Android
  may kill Wish Jar when you switch to another app. Data is saved as you go,
  and the app reopens on the start screen.
