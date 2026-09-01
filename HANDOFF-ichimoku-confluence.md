# HANDOFF — Ichimoku Cloud + DeMark confluence pairing

**Status:** NOT STARTED (a prior attempt hit the session usage limit before committing
anything; its worktree was auto-cleaned, so no code survived). Begin fresh from `main`.

**Goal:** Add an Ichimoku Kinko Hyo model to `demark-trading.html` and pair it with the
existing DeMark / TD Sequential engine so DeMark reversal signals are filtered/confirmed
by Ichimoku trend context. Target: part of a 7-day "ready to deploy on Robinhood" push.

---

## 0. Orient first (do this before writing code)

- Repo: `jacksonscastillo/Jackson-Castillo-`. GitHub MCP tools are restricted to this repo.
- The whole app is ONE zero-dependency static file: **`demark-trading.html`** (inline CSS +
  JS, no libraries, no build). Navy/gold aesthetic. Do not add dependencies or split files.
- `git fetch origin main && git checkout -b claude/ichimoku-demark-confluence origin/main`
- **READ `demark-trading.html` end to end** before touching it. Key pieces to locate:
  - `computeDeMark(bars)` — TD Setup (1–9, perfection), TD Countdown (1–13), TDST, price flips.
  - `riskLevels(...)` — TD risk stop levels.
  - `buildIntents(...)` (~line 672+) — turns signals into actionable trade intents (this is
    what the "agent"/live side consumes; each intent has a `signal`/rationale).
  - `backtest(...)` — risk-based position sizing, equity/benchmark, drawdown, trade log,
    monthly returns, metrics (Sharpe/Sortino/profit factor with `⚠ n<30` thin-sample flags).
  - `renderChart(...)` — builds an SVG candlestick chart with TD numbers/markers.
  - `renderBacktest(...)`, the `state` object, the entry-trigger `<select id="btTrigger">`,
    and the `localStorage` persistence helpers.
- **Run the tests FIRST to establish the baseline:** `/opt/node22/bin/node --test`
  (expect **79 passing**). Tests live in `tests/` and import functions from the inline
  `<script>` (see how existing tests extract/require it — follow that same pattern).

## 1. Ichimoku Kinko Hyo — pure, testable function

Add `ichimoku(bars, {tenkan=9, kijun=26, senkouB=52, displacement=26}={})` returning
per-bar arrays (nulls during warmup):

- **Tenkan-sen** = (highest high + lowest low) / 2 over the last `tenkan` bars.
- **Kijun-sen**  = (HH + LL) / 2 over the last `kijun` bars.
- **Senkou Span A** = (Tenkan + Kijun) / 2, plotted **shifted FORWARD** by `displacement`.
- **Senkou Span B** = (HH + LL)/2 over `senkouB` bars, **shifted FORWARD** by `displacement`.
- **Chikou Span** = close, **shifted BACKWARD** by `displacement`.

Defaults 9 / 26 / 52 / 26 as named constants. Keep it module-level and pure like the other
engine fns so the test harness can import it. **Add tests** with a hand-computed fixture that
verify Tenkan/Kijun values and that the cloud (A/B) is shifted forward correctly.

## 2. Chart overlay

In `renderChart`, draw the Ichimoku layer **under** the candles:
- **Kumo (cloud)**: shaded band between Senkou A and B — bullish tint when A > B, bearish
  tint when B > A. Respect the forward displacement (cloud projects to the right of the last
  candle if the SVG viewport allows, else clamp to the edge).
- **Tenkan** (light line) and **Kijun** (stronger line). Chikou optional.
- Add a **checkbox to show/hide** the Ichimoku overlay; persist the choice in `localStorage`.
- Keep it readable — the TD Setup/Countdown numbers must stay legible over the cloud.

## 3. Confluence pairing (the actual point)

Add pure helpers and document the exact rules in a comment:
- `ichimokuBias(ich, i)` → `'bull' | 'bear' | 'neutral'`.
- `passesConfluence(signal, bias, mode)` → boolean.

Expose a control (select) with three modes:
- **off** — DeMark only (current behavior). **Default**, so nothing breaks.
- **trend filter** — accept a DeMark **BUY** only when Ichimoku is *not bearish*
  (e.g. `close ≥ Kijun-sen` AND price at/above the cloud, i.e. reclaiming trend);
  accept a DeMark **SELL/exit** only when *not bullish* (mirror).
- **strict** — require full alignment. BUY: price above cloud AND Tenkan > Kijun AND cloud
  green ahead. SELL: mirror image.

Rationale for the user: DeMark buys are counter-trend (buying exhaustion). In the demo
backtest all 6 stopped out because they fought the trend. Ichimoku confirmation filters those.

**Add tests** for `ichimokuBias` and `passesConfluence`, and assert the confluence gate
produces **≤** the DeMark-only signal count on the demo bars.

## 4. Wire into intents + backtest (so DeMark-only vs DeMark+Ichimoku is comparable)

- `buildIntents`: when a confluence mode is active, only emit intents for signals that pass
  the gate; append the Ichimoku bias + which mode confirmed it into the intent's
  `signal`/rationale so the user sees *why* a trade was taken.
- `backtest`: apply the same gate to entries, and add the confluence mode to the entry-trigger
  options (or a parallel control) so the user can run **DeMark-only vs DeMark+Ichimoku
  (filter / strict)** and compare. Keep the existing risk-based sizing intact.
- Degrade gracefully when there aren't enough bars for Ichimoku (needs ≥ `kijun + displacement`
  warmup) — no crashes, just no confluence gating until warmed up.

---

## Environment & verification (this sandbox)

- Node 22: **`/opt/node22/bin/node`**. Tests: `/opt/node22/bin/node --test` (keep all 79 green,
  add new ones).
- Syntax check the inline script: extract the `<script>` block and `node --check` it.
- Playwright (chromium headless) at `/opt/node22/lib/node_modules/playwright`
  (`import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs'`).
  **Do NOT run `playwright install`** — Chromium is preinstalled.
- **VERIFY end-to-end before committing:** load the page from `file://`, click the demo/sample
  button, toggle the Ichimoku overlay (cloud appears), switch confluence mode (backtest
  re-runs), and assert **zero page/console errors** except the Google-Fonts `CERT` warning
  (network is locked down — only github.com is reachable; that font CERT error is expected and
  harmless). Save a screenshot to `/tmp` showing the cloud + TD numbers together.
- **Network:** all external hosts except GitHub return 403 — do NOT try to fetch live prices.

## Git / PR workflow

- Branch: **`claude/ichimoku-demark-confluence`** (base `main`).
- Commit with clear messages; `git push -u origin claude/ichimoku-demark-confluence`
  (retry up to 4× with exponential backoff 2s/4s/8s/16s on network errors only).
- Open a **DRAFT** PR, base `main`, title **"Ichimoku Cloud overlay + DeMark confluence
  pairing"**. Body: the Ichimoku math + params, the confluence rules per mode, the wiring, and
  a **before/after** comparison (demo signal counts + backtest metrics DeMark-only vs
  DeMark+Ichimoku).
- End every commit message AND the PR body with this trailer line:
  `https://claude.ai/code/session_01DhwX4HDLwQwBCtXjTJVuMB`
- **NEVER** put any model identifier in commits, PR text, code comments, or any pushed artifact.

## Definition of done

79 existing tests still green + new Ichimoku/confluence tests green; overlay renders with the
cloud; confluence modes selectable and reflected in both intents and backtest; e2e Playwright
check clean; draft PR opened with the before/after comparison. Then report the DeMark-only vs
DeMark+Ichimoku result on the demo back to the user.

## Wider context (why this matters)

This tool is a DeMark TD Sequential trading assistant the user wants to run on Robinhood within
~7 days. The engine, risk-based backtest, exports, and safety checks are already merged to
`main`. This Ichimoku pairing is the current feature. The real gate before real money is
**validation on real price data** (the user must paste real SPY/ticker data — this sandbox
can't fetch it) plus the user's wallet size / risk %, and Robinhood account setup. Software
readiness in 7 days is achievable; live-trading readiness depends on those user-side steps.
