#!/usr/bin/env bash
set -euo pipefail
: "${ANDROID_SIGNING_KEYSTORE:?Set the private keystore path}"
: "${ANDROID_SIGNING_PASSWORD:?Set the private keystore password}"
: "${APKSIGNER_JAR:?Set the Android SDK apksigner.jar path}"
: "${1:?Supply the built APK path}"
: "${2:?Supply the signed output APK path}"
java -jar "$APKSIGNER_JAR" sign --ks "$ANDROID_SIGNING_KEYSTORE" --ks-type PKCS12 \
  --ks-key-alias field-assistant-signing --ks-pass env:ANDROID_SIGNING_PASSWORD \
  --key-pass env:ANDROID_SIGNING_PASSWORD --out "$2" "$1"
java -jar "$APKSIGNER_JAR" verify --verbose --print-certs "$2"
