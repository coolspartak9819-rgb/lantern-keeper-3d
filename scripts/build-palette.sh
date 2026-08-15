#!/usr/bin/env sh
set -eu
mkdir -p public/generated .build
clang++ -std=c++20 -O2 tools/scene_palette.cpp -o .build/scene-palette
.build/scene-palette > public/generated/palette.json
