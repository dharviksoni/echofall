#!/usr/bin/env bash
# Builds Echofall.apk straight from the Android SDK tools (no Gradle needed).
# Usage: bash build.sh    -> out/Echofall.apk
set -euo pipefail
cd "$(dirname "$0")"

SDK="${ANDROID_HOME:-$LOCALAPPDATA/Android/Sdk}"
BT="$SDK/build-tools/36.0.0"
PLAT="$SDK/platforms/android-35/android.jar"
KS=android/echofall.keystore
# The keystore and its password stay on this machine (both are git-ignored).
if [ -f android/keystore.pass ]; then KS_PASS=$(cat android/keystore.pass)
else KS_PASS=$(head -c 18 /dev/urandom | base64 | tr -dc 'A-Za-z0-9'); printf '%s' "$KS_PASS" > android/keystore.pass; fi

rm -rf build && mkdir -p build/classes build/gen build/assets out
cp -r www build/assets/www
rm -f build/assets/www/*.md build/assets/www/fonts/*.txt

echo "1/6 compiling resources"
"$BT/aapt2" compile --dir android/res -o build/res.zip

echo "2/6 linking manifest, resources and game files"
"$BT/aapt2" link -o build/base.apk -I "$PLAT" \
  --manifest android/AndroidManifest.xml --java build/gen \
  --min-sdk-version 26 --target-sdk-version 34 build/res.zip

echo "3/6 compiling Java"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$PLAT" -d build/classes \
  $(find android/src build/gen -name '*.java')

echo "4/6 converting to dex"
"$BT/d8.bat" --release --min-api 26 --lib "$PLAT" --output build $(find build/classes -name '*.class')

echo "5/6 packaging and aligning"
# Added with Python so entry names use forward slashes (Windows aapt2 writes backslashes).
python - <<'PY'
import os, zipfile
with zipfile.ZipFile('build/base.apk', 'a', zipfile.ZIP_DEFLATED) as z:
    z.write('build/classes.dex', 'classes.dex')
    for root, _, files in os.walk('build/assets'):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, 'build').replace(os.sep, '/'))
PY
"$BT/zipalign" -p -f 4 build/base.apk build/aligned.apk

echo "6/6 signing"
if [ ! -f "$KS" ]; then
  keytool -genkeypair -keystore "$KS" -alias echofall -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" -dname "CN=Echofall, O=Echofall" > /dev/null 2>&1
fi
"$BT/apksigner.bat" sign --ks "$KS" --ks-key-alias echofall --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" \
  --out out/Echofall.apk build/aligned.apk
"$BT/apksigner.bat" verify out/Echofall.apk
ls -la out/Echofall.apk
echo "Built out/Echofall.apk"
