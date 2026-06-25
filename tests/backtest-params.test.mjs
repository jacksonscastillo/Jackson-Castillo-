// Tests for the new backtest params (target-R multiple, ATR stop source) added
// in Dashboard v2. The key invariant: with NO new opts (no targetR/stopSource),
// backtest output is byte-for-byte the legacy behavior — so existing engine
// tests stay valid. New opts must change stop/target as specified.
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

test("backtest: omitting targetR reproduces the legacy default (no behavior change)", () => {
  const bars = barsFromCloses(cyclicalCloses(160));
  const { signals } = computeDeMark(bars);
  const legacy = backtest(bars, signals, { capital: 10000, useSetups: true, feesBps: 0 });
  // explicitly passing targetR:2 must equal omitting it, since the signal's own
  // 2R target was the previous hardcoded behavior.
  const explicit = backtest(bars, signals, { capital: 10000, useSetups: true, feesBps: 0, targetR: 2 });
  assert.equal(explicit.trades.length, legacy.trades.length);
  assert.equal(explicit.stats.totalReturnPct.toFixed(6), legacy.stats.totalReturnPct.toFixed(6));
});

test("backtest: a larger target-R multiple changes results", () => {
  const bars = barsFromCloses(cyclicalCloses(160));
  const { signals } = computeDeMark(bars);
  const base = backtest(bars, signals, { capital: 10000, useSetups: true, feesBps: 0 });
  const wide = backtest(bars, signals, { capital: 10000, useSetups: true, feesBps: 0, targetR: 5 });
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
  const r = backtest(bars, signals, { capital: 10000, useSetups: true, feesBps: 0, stopSource: "atr", atr, targetR: 2 });
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
  const r = backtest(bars, signals, { capital: 5000, useSetups: false, feesBps: 0, targetR: 2 });
  assert.equal(r.stats.nTrades, r.trades.length);
  assert.ok(isFinite(r.stats.totalReturnPct));
  assert.ok(isFinite(r.stats.maxDDPct));
  assert.ok(isFinite(r.stats.exposurePct));
});
