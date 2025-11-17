#!/bin/bash
set -e

APP_DIR="${1}"

if [ -z "$APP_DIR" ]; then
  APP_DIR=$(find dist -name "mac*" -type d 2>/dev/null | head -1)
fi

if [ -n "$APP_DIR" ]; then
  APP_PATH=$(find "$APP_DIR" -name "*.app" -type d 2>/dev/null | head -1)
else
  APP_PATH=$(find dist -name "*.app" -type d 2>/dev/null | head -1)
fi

if [ -z "$APP_PATH" ]; then
  echo "Error: No .app file found"
  exit 1
fi

echo "Signing: $APP_PATH"
codesign --force --deep --sign - "$APP_PATH"
echo "Code signing completed"