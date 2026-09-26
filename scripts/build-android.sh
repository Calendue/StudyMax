#!/usr/bin/env bash
# Build the signed release APK: release/StudyMax-1.0.0-1.apk
#
# Usage:
#   bash scripts/build-android.sh          # ship what's already in dist/
#   bash scripts/build-android.sh --web    # npm run build first
#   OUT_DIR=/some/dir bash scripts/build-android.sh   # write the APK somewhere other than release/
#
# Needs android/keystore.properties (see keystore.properties.example); without it Gradle produces an
# unsigned APK and this script stops.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/release}"
NAME="StudyMax-1.0.0-1.apk"
# The system JDK may be newer than Gradle supports; Android Studio's bundled JDK is known good.
export JAVA_HOME="${JAVA_HOME_OVERRIDE:-/Applications/Android Studio.app/Contents/jbr/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

cd "$ROOT"
if [[ ! -f android/keystore.properties ]]; then
  echo "Missing android/keystore.properties: the release APK would be unsigned." >&2
  exit 1
fi
if [[ "${1:-}" == "--web" ]]; then npm run build; fi
npx cap sync android

(cd android && ./gradlew --no-daemon assembleRelease)

APK="android/app/build/outputs/apk/release/app-release.apk"
mkdir -p "$OUT_DIR"
cp "$APK" "$OUT_DIR/$NAME"
BUILD_TOOLS="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"
"$BUILD_TOOLS/apksigner" verify "$OUT_DIR/$NAME"
ls -lh "$OUT_DIR/$NAME"
