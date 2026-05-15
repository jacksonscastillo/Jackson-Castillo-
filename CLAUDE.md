# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A zero-dependency, single-file static web app (`index.html`) called the **Volatility Buffer Simulator**. It compares two investment strategies over historical S&P 500 data (Jan 2000–Dec 2024):

- **100% S&P 500** — all dollars invested in the market
- **S&P 500 + NM Whole Life** — split between the market and a Northwestern Mutual whole life insurance policy

There is no build system, no package manager, no server. Open `index.html` directly in a browser to run the app.

## Architecture

Everything lives inline in `index.html`: CSS custom properties in `:root`, all JavaScript in a `<script>` block, no external JS dependencies.

### Data Layer

`SP500` is a hard-coded array of 300 monthly returns (25 years × 12 months). `CRISES` marks three market downturns by index range (DOTCOM, GFC, COVID). These are the only inputs to the simulation.

### Simulation Engine (`simulate()`)

Runs once per parameter change. Iterates over all 300 months and computes two parallel portfolios:

- **`pureSpx`** — pure market: receives `monthly + moPrem` every month (same total dollars as the blend strategy)
- **`bSpx` + `cv`** — blend: market sleeve gets `monthly`, whole life sleeve gets `moPrem`

The whole life model applies guaranteed interest (`NM_GUAR = 0.03`), dividend interest (`NM_DIV = 0.0575`), COI charges from `COI_T` (cost-of-insurance table by age), and a load expense that tapers over years. During crises, small distributions (`dist`) are pulled from cash value. Surrender value (`sv`) applies `SURR` factors for the first 13 years. Returns a 300-entry array of snapshot objects.

### State & Rendering

Single `state` object holds all user inputs (`initial`, `monthly`, `premium`, `age`, `payTo`), UI state (`mode`, `idx`, `hover`, `playing`, `speed`).

- **`rebuild()`** — called when any input changes; re-runs `simulate()`, resets playback, calls `render()`
- **`render()`** — pure DOM update from current `state` and `data`; updates headers, chart, stats bar
- **`bindNumberAndRange()`** — keeps each slider/number input pair in sync with `state`, calls `rebuild()`

### Chart (`RHChartSVG()`)

Generates an SVG string (not a canvas). Scales data points to pixel coordinates, draws a gradient fill, optional ghost line (dashed reference series), crisis highlight rects, and a hover/endpoint dot. The caller inserts the string via `innerHTML` and attaches mouse events via `attachHover()`.

### Three View Modes

Controlled by `state.mode`:
- `"blend"` — shows combined (S&P + WL) portfolio with dashed ghost line for pure S&P reference
- `"pure"` — shows only the 100% market portfolio
- `"split"` — renders three stacked charts (pure, total, cash value) with a comparison header

### Playback Engine

`tick()` runs on `setTimeout` with variable delay — shorter delays for normal months (~50 ms), longer for crisis months (up to 1500 ms) to dramatize downturns. Speed multiplier (`state.speed`) scales all delays. `startPlay()` / `stopPlay()` manage the timer.
