# DL2 Intro Style (Procedural)

Browser-run intro sequence inspired by a gritty, fog-heavy launch vibe. All visuals are procedural (shader + canvas), with DOM text cards and deterministic timeline control.

## Setup

```bash
npm install
```

## Run

```bash
npm run dev
```

## Build + Preview

```bash
npm run build
npm run preview
```

## Tests

```bash
npm test
```

## E2E

```bash
npm run e2e
```

## Capture (optional)

Start a preview server first:

```bash
npm run build
npm run preview -- --port 4173
```

Then capture frames:

```bash
npm run capture -- --duration=60000 --fps=30 --out=captures
```

The capture uses `?t=` seeking and a debug API for deterministic frames.

## Editing timing & text

Update script beats in `src/intro/script.ts`. Each beat controls:
- `at`: start time in ms
- `headline` / `sub`: text content
- `typewriter`: character speed + flicker + scanline
- `glitch`: glitch bursts
- `transitionIn` / `transitionOut`: hit presets
- `holdMs`: linger duration before exit

## Controls

- Hold `SPACE` for 600ms: skip to end.
- Press `D`: toggle debug overlay.
- Press `R`: replay (also available in debug overlay).
- Move mouse: parallax + wind push on debris.
- Click/tap: impact pulse + debris burst.
