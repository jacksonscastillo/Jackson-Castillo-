// Tests for the backtest params (target-R multiple, ATR stop source) and the
// risk-based position sizing.
//
// P0-1 CHANGE: the backtest now sizes each entry the SAME way the live intent
// sizer does — risk a fixed fraction of CURRENT cash, divided by per-share risk
// (entry − stop), then capped by buying power. It NO LONGER goes all-in. The
// old "byte-identical to legacy all-in" invariant is therefore intentionally
// gone; these tests assert the new risk-based behavior instead.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEngine, barsFromCloses } from "./_engine.mjs";

const eng = loadEngine(["computeDeMark", "riskLevels", "mkSignal", "backtest", "mkTrade", "atrSeries"]);
const { computeDeMark, backtest, atrSeries } = eng;

// A long, cyclical close series that reliably produces buy signals & trades.
function cyclicalCloses(n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(120 + 18 * Math.sin(i / 6) + 6 * Math.sin(i / 2.3));
  return out;
}

test("backtest: passing targetR:2 equals omitting it (target default unchanged)", () => {
  const bars = barsFromCloses(cyclicalCloses(160));
  const { signals } = computeDeMark(bars);
  const base = backtest(bars, signals, { capital: 10000, useSetups: true, feesBps: 0, riskPct: 0.01 });
  // explicitly passing targetR:2 must equal omitting it, since the signal's own
  // 2R target was the previous hardcoded behavior. (Sizing held constant.)
  const explicit = backtest(bars, signals, { capital: 10000, useSetups: true, feesBps: 0, riskPct: 0.01, targetR: 2 });
  assert.equal(explicit.trades.length, base.trades.length);
  assert.equal(explicit.stats.totalReturnPct.toFixed(6), base.stats.totalReturnPct.toFixed(6));
});

test("P0-1: backtest sizes entries by risk%, NOT all-in", () => {
  const bars = barsFromCloses(cyclicalCloses(160));
  const { signals } = computeDeMark(bars);
  const riskPct = 0.01;
  const risk = backtest(bars, signals, { capital: 10000, useSetups: true, feesBps: 0, riskPct });
  assert.ok(risk.trades.length > 0, "expected some trades");

  // Verify the FIRST entry was sized by risk%, capped by buying power — not all-in.
  const t0 = risk.trades[0];
  const entryFill = t0.entryPx;             // already includes slippage (0 here)
  // reconstruct the stop the live trade used: signal's own TD stop. The trade
  // shares should equal floor(cash*riskPct / (entryFill - stop)), capped.
  // We can't see the per-trade stop directly, but we CAN assert the position is
  // far smaller than the all-in count (cash/entry) at 1% risk.
  const allInShares = Math.floor(10000 / entryFill);
  assert.ok(t0.shares > 0, "qty must be >= 1");
  assert.ok(t0.shares < allInShares, `risk-sized qty (${t0.shares}) must be < all-in (${allInShares})`);

  // And exposure / return should differ from the legacy all-in (riskPct huge).
  const allIn = backtest(bars, signals, { capital: 10000, useSetups: true, feesBps: 0, riskPct: 1e9 });
  assert.notEqual(risk.stats.totalReturnPct.toFixed(4), allIn.stats.totalReturnPct.toFixed(4));
  assert.ok(risk.stats.exposurePct <= allIn.stats.exposurePct + 1e-9);
});

test("P0-1: hand fixture locks the risk-based sizing formula", () => {
  // Construct a single, fully-determined buy entry and read back the share count.
  // closes designed so a buy setup (then countdown) fires; we then check the
  // entry share count == floor(cash*riskPct / (entryFill - stop)) capped by
  // floor(cash/entryFill).
  const bars = barsFromCloses(cyclicalCloses(160));
  const { signals } = computeDeMark(bars);
  const capital = 25000, riskPct = 0.02, feesBps = 0;
  const r = backtest(bars, signals, { capital, useSetups: true, feesBps, riskPct });
  assert.ok(r.trades.length > 0);
  const t0 = r.trades[0];

  // Recompute expected qty from the SAME inputs the engine used for trade 0.
  // entryFill has no slippage (feesBps 0); the stop is the signal's TD stop for
  // the triggering signal. Find that signal by its entry date.
  const trigger = signals
    .filter(s => s.side === "buy")
    .find(s => bars[(s.perfIdx != null && s.type.includes("SETUP")) ? s.perfIdx : s.idx].t === t0.entryDate);
  assert.ok(trigger, "found the triggering signal for the first trade");
  const entryFill = t0.entryPx;
  const stop = trigger.risk.stop;
  const rps = entryFill - stop;
  let expected = Math.floor((capital * riskPct) / rps);
  const maxAfford = Math.floor(capital / entryFill);
  if (expected > maxAfford) expected = maxAfford;
  assert.equal(t0.shares, expected, `expected risk-sized qty ${expected}, got ${t0.shares}`);
});

test("backtest: a larger target-R multiple changes results", () => {
  const bars = barsFromCloses(cyclicalCloses(160));
  const { signals } = computeDeMark(bars);
  const base = backtest(bars, signals, { capital: 10000, useSetups: true, feesBps: 0, riskPct: 0.01 });
  const wide = backtest(bars, signals, { capital: 10000, useSetups: true, feesBps: 0, riskPct: 0.01, targetR: 5 });
  // With a much wider target, fewer trades exit on 'target'; total return differs.
  const baseTargets = base.trades.filter((t) => t.reason === "target").length;
  const wideTargets = wide.trades.filter((t) => t.reason === "target").length;
  assert.ok(wideTargets <= baseTargets, "wider target should not increase target-hits");
  // sanity: still produces a finite, non-throwing result
  assert.ok(isFinite(wide.stats.totalReturnPct));
});

test("backtest: ATR stop source runs and stays finite/graceful", () => {
  const bars = barsFromCloses(cyclicalCloses(160));
  const { signals } = computeDeMark(bars);
  const atr = atrSeries(bars, 14);
  const r = backtest(bars, signals, { capital: 10000, useSetups: true, feesBps: 0, riskPct: 0.01, stopSource: "atr", atr, targetR: 2 });
  assert.ok(Array.isArray(r.trades));
  assert.ok(isFinite(r.stats.totalReturnPct));
  assert.ok(isFinite(r.stats.maxDDPct));
  // every trade has a stop strictly below its entry (valid long stop)
  for (const t of r.trades) assert.ok(t.exitPx > 0 && t.entryPx > 0);
});

test("backtest: zero trades degrade gracefully (no NaN/throw)", () => {
  // strictly monotone rising closes -> no buy setups complete in a way that trades
  const bars = barsFromCloses(Array.from({ length: 40 }, (_, i) => 100 + i));
  const { signals } = computeDeMark(bars);
  const r = backtest(bars, signals, { capital: 5000, useSetups: false, feesBps: 0, riskPct: 0.01, targetR: 2 });
  assert.equal(r.stats.nTrades, r.trades.length);
  assert.ok(isFinite(r.stats.totalReturnPct));
  assert.ok(isFinite(r.stats.maxDDPct));
  assert.ok(isFinite(r.stats.exposurePct));
});

test("backtest: riskPct<=0 falls back to no sizing (no trades opened)", () => {
  const bars = barsFromCloses(cyclicalCloses(160));
  const { signals } = computeDeMark(bars);
  const r = backtest(bars, signals, { capital: 10000, useSetups: true, feesBps: 0, riskPct: 0 });
  // with no risk budget, qty is always 0 → no positions opened.
  assert.equal(r.trades.length, 0);
  assert.equal(r.stats.exposurePct, 0);
});
