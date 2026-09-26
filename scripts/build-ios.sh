#!/usr/bin/env bash
# Build the signed ad hoc IPA: release/StudyMax-1.0.0-1.ipa
#
# Usage:
#   bash scripts/build-ios.sh          # ship what's already in dist/
#   bash scripts/build-ios.sh --web    # npm run build first
#   OUT_DIR=/some/dir bash scripts/build-ios.sh   # write the IPA somewhere other than release/
#
# Signing is Xcode cloud-managed automatic signing for team JM7G3W9CWS, so the Apple account signed
# into Xcode provides the distribution certificate and the ad hoc profile (-allowProvisioningUpdates).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="${OUT_DIR:-$ROOT/release}"
WORK="${WORK_DIR:-$ROOT/ios/App/build/adhoc}"
ARCHIVE="$WORK/StudyMax.xcarchive"
EXPORT="$WORK/export"
NAME="StudyMax-1.0.0-1.ipa"

cd "$ROOT"
if [[ "${1:-}" == "--web" ]]; then npm run build; fi
npx cap sync ios

rm -rf "$ARCHIVE" "$EXPORT"
mkdir -p "$WORK" "$OUT_DIR"

xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates archive

xcodebuild -exportArchive -archivePath "$ARCHIVE" \
  -exportOptionsPlist ios/ExportOptions-adhoc.plist -exportPath "$EXPORT" \
  -allowProvisioningUpdates

cp "$EXPORT"/*.ipa "$OUT_DIR/$NAME"
ls -lh "$OUT_DIR/$NAME"
