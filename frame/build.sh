#!/usr/bin/env bash
# Builds frame/build/wish-jar-frame.apk without Gradle: a kiosk WebView that opens the online site
# (MainActivity), so the app itself only needs building again when its Java code changes.
# Needs JDK 17 and Android build-tools 34 + platform 34:
#   sdkmanager --sdk_root=$ANDROID_HOME "build-tools;34.0.0" "platforms;android-34"
set -euo pipefail
cd "$(dirname "$0")"

ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
BT="${BUILD_TOOLS:-$ANDROID_HOME/build-tools/34.0.0}"
JAR="$ANDROID_HOME/platforms/android-34/android.jar"
JAVA_BIN="${JAVA_HOME:+$JAVA_HOME/bin/}"
export PATH="${JAVA_BIN}${JAVA_BIN:+:}$PATH" # d8 and apksigner run java from PATH
# Updates must be signed with the same key, or the app has to be uninstalled, which deletes its data.
KS="${KEYSTORE:-$HOME/.android/debug.keystore}"
VERSION_CODE="${VERSION_CODE:-$(git rev-list --count HEAD)}"

rm -rf build && mkdir -p build/res/mipmap-xxxhdpi build/gen build/classes build/apk

cp ../assets/icon.png build/res/mipmap-xxxhdpi/ic_launcher.png
"$BT/aapt2" compile --dir build/res -o build/res.zip
"$BT/aapt2" link -o build/base.apk -I "$JAR" --manifest AndroidManifest.xml build/res.zip \
  --java build/gen --min-sdk-version 23 --target-sdk-version 23 \
  --version-code "$VERSION_CODE" --version-name "1.0.$VERSION_CODE"

"${JAVA_BIN}javac" -nowarn -source 8 -target 8 -classpath "$JAR" -d build/classes \
  src/com/wishjar/frame/*.java build/gen/com/wishjar/frame/R.java
"$BT/d8" --min-api 23 --lib "$JAR" --output build/apk $(find build/classes -name '*.class')

"${JAVA_BIN}jar" --update --no-manifest --file build/base.apk -C build/apk classes.dex
"$BT/zipalign" -f 4 build/base.apk build/aligned.apk

if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  "${JAVA_BIN}keytool" -genkeypair -keystore "$KS" -storepass android -keypass android -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" >/dev/null 2>&1
fi
"$BT/apksigner" sign --ks "$KS" --ks-pass pass:android --key-pass pass:android \
  --out build/wish-jar-frame.apk build/aligned.apk
echo "Built frame/build/wish-jar-frame.apk"
