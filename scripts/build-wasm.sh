#!/usr/bin/env sh
set -eu

if command -v rustup >/dev/null 2>&1; then
  RUSTUP="$(command -v rustup)"
elif [ -x /opt/homebrew/opt/rustup/bin/rustup ]; then
  RUSTUP=/opt/homebrew/opt/rustup/bin/rustup
else
  echo "rustup is required. Install Rust from https://rustup.rs" >&2
  exit 1
fi

TOOLCHAIN="$($RUSTUP toolchain list | sed -n '1s/ .*//p')"
RUST_BIN="$HOME/.rustup/toolchains/$TOOLCHAIN/bin"

if [ ! -x "$RUST_BIN/cargo" ]; then
  echo "The active rustup toolchain is incomplete." >&2
  exit 1
fi

PATH="$RUST_BIN:$PATH" "$RUST_BIN/cargo" build --manifest-path rust-core/Cargo.toml --target wasm32-unknown-unknown --release
mkdir -p public/wasm
cp rust-core/target/wasm32-unknown-unknown/release/lantern_keeper_core.wasm public/wasm/lantern_keeper_core.wasm
