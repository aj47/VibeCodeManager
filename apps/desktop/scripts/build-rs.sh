#!/bin/bash

mkdir -p resources/bin

cd vibecode-rs

cargo build -r

# Handle different platforms
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
    # Windows
    cp target/release/vibecode-rs.exe ../resources/bin/vibecode-rs.exe
else
    # Unix-like systems (macOS, Linux)
    cp target/release/vibecode-rs ../resources/bin/vibecode-rs
fi

cd ..

# Sign the binary on macOS
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "🔐 Signing Rust binary..."
    ./scripts/sign-binary.sh
fi
