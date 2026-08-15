# Lantern Keeper 3D

A small atmospheric first-person game about bringing an autumn park back to
life before nightfall.

Gather three fireflies, find a dark lantern, press `E` to light it, and keep
moving. Eight lanterns, a 90-second timer, combo-style scoring and a short
walkable park make up the first playable slice.

## Run

```bash
npm install
npm run dev
```

Open the local Vite URL. Click **Enter the park**, then use `WASD` to move,
the mouse to look around, and `E` near a lantern. Click the canvas again if
you need to recapture the mouse. `R` restarts after the round ends.

## Stack

- Three.js and WebGL
- Vite
- Procedural low-poly environment
- Dynamic point lights, fog, fireflies and responsive HUD

## Verification

```bash
npm run build
```

The project intentionally starts as a polished single-player loop. A future
leaderboard can be added without changing the core game scene.
