#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DESKTOP_DIR="$(dirname "$SCRIPT_DIR")"
SWIFT_DIR="$DESKTOP_DIR/vibecode-stt"
OUTPUT_DIR="$DESKTOP_DIR/resources/bin"

echo "Building vibecode-stt..."
echo "Swift dir: $SWIFT_DIR"
echo "Output dir: $OUTPUT_DIR"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Build the Swift package
cd "$SWIFT_DIR"
swift build -c release

# Copy the binary
cp .build/release/vibecode-stt "$OUTPUT_DIR/"

echo "Built vibecode-stt successfully!"
ls -la "$OUTPUT_DIR/vibecode-stt"
