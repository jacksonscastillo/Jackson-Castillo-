// Engine tests for the DeMark / TD Sequential core in demark-trading.html.
//
// We read the HTML, extract its <script>, and slice the pure engine functions
// (computeDeMark, riskLevels, mkSignal, backtest, mkTrade) — see tests/_engine.mjs.
// The HTML itself is never modified. Assertions use both hand-crafted
// deterministic fixtures (small bar arrays with known TD counts) and the
// cyclical demo generator shipped in the page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEngine, demoBars, barsFromCloses } from "./_engine.mjs";

const eng = loadEngine(["computeDeMark", "riskLevels", "mkSignal", "backtest", "mkTrade"]);
const { computeDeMark, riskLevels, backtest } = eng;

// Recycle threshold mirrored from the engine (P1-3, default 18).
const RECYCLE = 18;

/** Replay the buy-countdown pass to recover the close of countdown-bar 8 for
 *  each completed buy CD-13, so tests can assert the bar-13 <= close8 rule.
 *  Mirrors the engine's fidelity rules: flip-gated setup starts (via setupFlag),
 *  same-direction recycle reset at RECYCLE, and TDST-break cancellation (a close
 *  above the active buy-setup TDST resistance cancels the in-progress CD). */
function reconBuyCD(bars) {
  const r = computeDeMark(bars);
  const c = bars.map((b) => b.c), l = bars.map((b) => b.l);
  const ann = r.ann;
  let buyCD = null;
  const out = [];
  for (let i = 0; i < bars.length; i++) {
    const f = ann[i].setupFlag;
    if (f && f.dir === "buy") buyCD = { count: 0, close8: null, tdst: f.tdst }; // start or recycle
    if (f && f.dir === "sell") buyCD = null;
    if (buyCD && ann[i].buyRun === RECYCLE) buyCD = { count: 0, close8: null, tdst: buyCD.tdst };
    if (buyCD && buyCD.count > 0 && buyCD.tdst != null && c[i] > buyCD.tdst) buyCD = null;
    if (buyCD && i >= 2 && c[i] <= l[i - 2]) {
      if (buyCD.count < 12) { buyCD.count++; if (buyCD.count === 8) buyCD.close8 = c[i]; }
      else if (buyCD.close8 != null && l[i] <= buyCD.close8) { out.push({ idx: i, close8: buyCD.close8 }); buyCD = null; }
    }
  }
  return out;
}

/** Sell mirror of reconBuyCD. */
function reconSellCD(bars) {
  const r = computeDeMark(bars);
  const c = bars.map((b) => b.c), h = bars.map((b) => b.h);
  const ann = r.ann;
  let sellCD = null;
  const out = [];
  for (let i = 0; i < bars.length; i++) {
    const f = ann[i].setupFlag;
    if (f && f.dir === "sell") sellCD = { count: 0, close8: null, tdst: f.tdst };
    if (f && f.dir === "buy") sellCD = null;
    if (sellCD && ann[i].sellRun === RECYCLE) sellCD = { count: 0, close8: null, tdst: sellCD.tdst };
    if (sellCD && sellCD.count > 0 && sellCD.tdst != null && c[i] < sellCD.tdst) sellCD = null;
    if (sellCD && i >= 2 && c[i] >= h[i - 2]) {
      if (sellCD.count < 12) { sellCD.count++; if (sellCD.count === 8) sellCD.close8 = c[i]; }
      else if (sellCD.close8 != null && h[i] >= sellCD.close8) { out.push({ idx: i, close8: sellCD.close8 }); sellCD = null; }
    }
  }
  return out;
}

/* ---------------------------------------------------------------- Setup 9 */

test("buy Setup 9: nine consecutive closes each < close 4 bars earlier (hand-crafted)", () => {
  // 4 priming bars, then a strictly falling run -> buy setup counts 1..9.
  const closes = [100, 100, 100, 100, 99, 98, 97, 96, 95, 94, 93, 92, 91];
  const bars = barsFromCloses(closes);
  const r = computeDeMark(bars);

  assert.deepEqual(
    r.ann.map((a) => a.buySetup),
    [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    "buy setup counter should increment 1..9 on the falling run",
  );

  const s9 = r.signals.find((s) => s.type === "BUY_SETUP");
  assert.ok(s9, "a BUY_SETUP signal must be emitted");
  assert.equal(s9.idx, 12);
  assert.equal(s9.side, "buy");
  // consecutiveness invariant: each of the 9 setup bars closes below close[-4]
  for (let k = s9.idx - 8; k <= s9.idx; k++) {
    assert.ok(bars[k].c < bars[k - 4].c, `bar ${k}: close ${bars[k].c} should be < close[-4] ${bars[k - 4].c}`);
  }
});

test("sell Setup 9: nine consecutive closes each > close 4 bars earlier (hand-crafted)", () => {
  const closes = [100, 100, 100, 100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
  const bars = barsFromCloses(closes);
  const r = computeDeMark(bars);

  assert.deepEqual(
    r.ann.map((a) => a.sellSetup),
    [0, 0, 0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
    "sell setup counter should increment 1..9 on the rising run",
  );

  const s9 = r.signals.find((s) => s.type === "SELL_SETUP");
  assert.ok(s9, "a SELL_SETUP signal must be emitted");
  assert.equal(s9.idx, 12);
  assert.equal(s9.side, "sell");
  for (let k = s9.idx - 8; k <= s9.idx; k++) {
    assert.ok(bars[k].c > bars[k - 4].c, `bar ${k}: close ${bars[k].c} should be > close[-4] ${bars[k - 4].c}`);
  }
});

test("Setup 9 consecutiveness holds for every setup in the cyclical demo", () => {
  const bars = demoBars();
  const r = computeDeMark(bars);
  const setups = r.signals.filter((s) => s.type.includes("SETUP"));
  assert.ok(setups.length > 0, "demo should produce setups");
  for (const sg of setups) {
    for (let k = sg.idx - 8; k <= sg.idx; k++) {
      if (sg.side === "buy") assert.ok(bars[k].c < bars[k - 4].c, `buy setup ${sg.idx}: bar ${k} not < close[-4]`);
      else assert.ok(bars[k].c > bars[k - 4].c, `sell setup ${sg.idx}: bar ${k} not > close[-4]`);
    }
  }
});

/* ----------------------------------------------------------- Countdown 13 */

test("buy Countdown 13: close<=low[-2] at bar 13 and bar-13 low <= close8 (hand-crafted)", () => {
  // Strictly decreasing closes drive a buy setup then a full buy countdown.
  const closes = [];
  for (let i = 0; i < 40; i++) closes.push(200 - i * 2);
  const bars = barsFromCloses(closes, { wickHi: 0.3, wickLo: 0.3 });
  const r = computeDeMark(bars);

  const cds = r.signals.filter((s) => s.type === "BUY_COUNTDOWN");
  assert.equal(cds.length, 1, "expected exactly one buy countdown to complete");
  const recon = reconBuyCD(bars);
  assert.equal(recon.length, 1);
  const { idx, close8 } = recon[0];
  assert.equal(cds[0].idx, idx, "engine CD-13 index should match reconstruction");

  const c = bars.map((b) => b.c), l = bars.map((b) => b.l);
  assert.ok(c[idx] <= l[idx - 2], "CD bar 13 close must be <= low two bars earlier");
  assert.ok(l[idx] <= close8, "CD bar 13 low must be <= close of countdown bar 8");
});

test("sell Countdown 13: close>=high[-2] at bar 13 and bar-13 high >= close8 (hand-crafted)", () => {
  const closes = [];
  for (let i = 0; i < 40; i++) closes.push(120 + i * 2);
  const bars = barsFromCloses(closes, { wickHi: 0.3, wickLo: 0.3 });
  const r = computeDeMark(bars);

  const cds = r.signals.filter((s) => s.type === "SELL_COUNTDOWN");
  assert.equal(cds.length, 1, "expected exactly one sell countdown to complete");
  const recon = reconSellCD(bars);
  assert.equal(recon.length, 1);
  const { idx, close8 } = recon[0];
  assert.equal(cds[0].idx, idx, "engine CD-13 index should match reconstruction");

  const c = bars.map((b) => b.c), h = bars.map((b) => b.h);
  assert.ok(c[idx] >= h[idx - 2], "CD bar 13 close must be >= high two bars earlier");
  assert.ok(h[idx] >= close8, "CD bar 13 high must be >= close of countdown bar 8");
});

test("Countdown 13 qualifier holds for every countdown (trending fixtures)", () => {
  // NOTE: after the TD-fidelity fixes (flip-gated setup starts, TDST-break
  // cancellation, recycle reset), the cyclical demo no longer completes any
  // countdown — every nascent CD is structurally cancelled (a close back above
  // the buy-setup TDST, or a recycle) before it reaches 13. That is the
  // corrected behavior. To still exercise the bar-13 qualifier we use sustained
  // trends (no TDST break) that DO complete a countdown.
  const downCloses = []; for (let i = 0; i < 40; i++) downCloses.push(200 - i * 2);
  const upCloses = []; for (let i = 0; i < 40; i++) upCloses.push(120 + i * 2);
  const downBars = barsFromCloses(downCloses, { wickHi: 0.3, wickLo: 0.3 });
  const upBars = barsFromCloses(upCloses, { wickHi: 0.3, wickLo: 0.3 });

  const rd = computeDeMark(downBars), ru = computeDeMark(upBars);
  const buyCDs = rd.signals.filter((s) => s.type === "BUY_COUNTDOWN");
  const sellCDs = ru.signals.filter((s) => s.type === "SELL_COUNTDOWN");
  assert.ok(buyCDs.length > 0, "sustained downtrend should complete a buy countdown");
  assert.ok(sellCDs.length > 0, "sustained uptrend should complete a sell countdown");

  const cd = downBars.map((b) => b.c), ld = downBars.map((b) => b.l);
  const cu = upBars.map((b) => b.c), hu = upBars.map((b) => b.h);
  for (const sg of buyCDs) assert.ok(cd[sg.idx] <= ld[sg.idx - 2], `buy CD ${sg.idx}: close not <= low[-2]`);
  for (const sg of sellCDs) assert.ok(cu[sg.idx] >= hu[sg.idx - 2], `sell CD ${sg.idx}: close not >= high[-2]`);

  // bar-13 vs close8 via reconstruction
  for (const { idx, close8 } of reconBuyCD(downBars)) assert.ok(ld[idx] <= close8, `buy CD ${idx}: low not <= close8`);
  for (const { idx, close8 } of reconSellCD(upBars)) assert.ok(hu[idx] >= close8, `sell CD ${idx}: high not >= close8`);
});

test("cyclical demo produces no completed countdowns after fidelity fixes (TDST/recycle/flip)", () => {
  // Locks in the changed signal mix: the choppy demo's countdowns are all
  // structurally cancelled, so only setups survive. If a future change lets a
  // demo countdown complete again, this test flags it for review.
  const bars = demoBars();
  const r = computeDeMark(bars);
  const counts = {};
  for (const s of r.signals) counts[s.type] = (counts[s.type] || 0) + 1;
  assert.equal(counts.BUY_SETUP, 7, "demo buy-setup count");
  assert.equal(counts.SELL_SETUP, 3, "demo sell-setup count");
  assert.equal(counts.BUY_COUNTDOWN || 0, 0, "demo completes no buy countdown");
  assert.equal(counts.SELL_COUNTDOWN || 0, 0, "demo completes no sell countdown");
});

/* ----------------------------------------------------- deferred perfection */

test("deferred perfection: perfIdx>idx and breaches min(low6,low7) (buy) / max(high6,high7) (sell)", () => {
  const bars = demoBars();
  const r = computeDeMark(bars);
  const l = bars.map((b) => b.l), h = bars.map((b) => b.h);

  const deferred = r.signals.filter((s) => s.type.includes("SETUP") && s.perfIdx != null);
  assert.ok(deferred.length > 0, "demo should exercise at least one deferred-perfected setup");

  for (const sg of deferred) {
    assert.ok(sg.perfected, "a setup with a perfIdx must be flagged perfected");
    assert.ok(sg.perfIdx > sg.idx, `perfIdx ${sg.perfIdx} must come after setup bar ${sg.idx}`);
    // perfRef is min(low[idx-3],low[idx-2]) for buys / max(high[idx-3],high[idx-2]) for sells,
    // i.e. the bar-6/7 reference of the 9-bar setup. The perfecting bar must breach it.
    if (sg.side === "buy") {
      const ref = Math.min(l[sg.idx - 3], l[sg.idx - 2]);
      assert.equal(sg.perfRef, ref, "buy perfRef should equal min(low6,low7)");
      assert.ok(l[sg.perfIdx] <= ref, `buy perfIdx ${sg.perfIdx} low must breach ref ${ref}`);
    } else {
      const ref = Math.max(h[sg.idx - 3], h[sg.idx - 2]);
      assert.equal(sg.perfRef, ref, "sell perfRef should equal max(high6,high7)");
      assert.ok(h[sg.perfIdx] >= ref, `sell perfIdx ${sg.perfIdx} high must breach ref ${ref}`);
    }
  }
});

/* ------------------------------------------------------------- risk levels */

test("risk stop < entry for buys, > entry for sells; riskPerShare>0 (every demo signal)", () => {
  const bars = demoBars();
  const r = computeDeMark(bars);
  assert.ok(r.signals.length > 0);
  for (const sg of r.signals) {
    assert.ok(sg.risk.riskPerShare > 0, `signal @${sg.idx} riskPerShare must be > 0 (got ${sg.risk.riskPerShare})`);
    if (sg.side === "buy") {
      assert.ok(sg.risk.stop < sg.price, `buy @${sg.idx}: stop ${sg.risk.stop} must be < entry ${sg.price}`);
      assert.ok(sg.risk.target > sg.price, `buy @${sg.idx}: 2R target ${sg.risk.target} must be > entry ${sg.price}`);
    } else {
      assert.ok(sg.risk.stop > sg.price, `sell @${sg.idx}: stop ${sg.risk.stop} must be > entry ${sg.price}`);
      assert.ok(sg.risk.target < sg.price, `sell @${sg.idx}: 2R target ${sg.risk.target} must be < entry ${sg.price}`);
    }
  }
});

test("riskLevels: buy/sell direct invariants on a hand-crafted window", () => {
  const bars = barsFromCloses([100, 99, 98, 97, 96, 95, 94, 93, 92, 91]);
  const buy = riskLevels("buy", bars, 0, bars.length - 1);
  assert.ok(buy.stop < bars[bars.length - 1].c, "buy stop below entry");
  assert.ok(buy.riskPerShare > 0);
  assert.ok(buy.target > bars[bars.length - 1].c, "buy 2R target above entry");

  const ub = barsFromCloses([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
  const sell = riskLevels("sell", ub, 0, ub.length - 1);
  assert.ok(sell.stop > ub[ub.length - 1].c, "sell stop above entry");
  assert.ok(sell.riskPerShare > 0);
  assert.ok(sell.target < ub[ub.length - 1].c, "sell 2R target below entry");
});

test("riskLevels: doji/zero-range window widens the stop by a floor, never a no-op stop==entry (P2-1)", () => {
  // The only bar has high==low==close (true range 0), so the raw TD stop would
  // land exactly at entry (riskPerShare 0). P2-1: instead of a no-op stop, widen
  // by a minimum floor (max(0.01, 0.1% of price)) and recompute the 2R target.
  const flat = [{ t: "2026-01-01", o: 100, h: 100, l: 100, c: 100, v: 1 }];
  const floor = Math.max(0.01, 100 * 0.001); // 0.1

  const buy = riskLevels("buy", flat, 0, 0);
  assert.ok(buy.riskPerShare > 0, "doji buy must yield positive risk, not 0/null");
  assert.ok(buy.stop < 100, "doji buy stop must be widened below entry");
  assert.equal(buy.stop, +(100 - floor).toFixed(2), "buy stop widened by the floor");
  assert.equal(buy.target, +(100 + (100 - buy.stop) * 2).toFixed(2), "2R target recomputed off widened stop");

  const sell = riskLevels("sell", flat, 0, 0);
  assert.ok(sell.riskPerShare > 0, "doji sell must yield positive risk, not 0/null");
  assert.ok(sell.stop > 100, "doji sell stop must be widened above entry");
  assert.equal(sell.stop, +(100 + floor).toFixed(2), "sell stop widened by the floor");
  assert.equal(sell.target, +(100 - (sell.stop - 100) * 2).toFixed(2), "2R target recomputed off widened stop");

  // Invariant on the whole demo: any non-null riskPerShare implies a correct-side stop.
  const bars = demoBars();
  const r = computeDeMark(bars);
  for (const sg of r.signals) {
    if (sg.risk.riskPerShare == null) continue; // sentinel: skipped downstream
    assert.ok(sg.risk.riskPerShare > 0, `non-null riskPerShare must be > 0 (@${sg.idx})`);
    if (sg.side === "buy") assert.ok(sg.risk.stop < sg.price, `buy stop must be < entry (@${sg.idx})`);
    else assert.ok(sg.risk.stop > sg.price, `sell stop must be > entry (@${sg.idx})`);
  }
});

/* ---------------------------------------------------------------- backtest */

function dateToFirstIdx(bars) {
  const m = {};
  bars.forEach((b, i) => { if (m[b.t] == null) m[b.t] = i; });
  return m;
}

function assertBacktestInvariants(bars, signals, opts) {
  const bt = backtest(bars, signals, opts);
  const cap = opts.capital;

  // equity length == bars.length
  assert.equal(bt.equity.length, bars.length, "equity series must have one point per bar");

  // finalEquity within $1 of capital*(1+totalReturnPct/100)
  const expected = cap * (1 + bt.stats.totalReturnPct / 100);
  assert.ok(
    Math.abs(bt.stats.finalEquity - expected) <= 1,
    `finalEquity ${bt.stats.finalEquity} should be within $1 of ${expected}`,
  );

  const idxOf = dateToFirstIdx(bars);
  for (const t of bt.trades) {
    // pnl signs consistent: pnl, pnlPct and (exit-entry) all agree
    const dir = Math.sign(t.exitPx - t.entryPx);
    if (t.pnl !== 0) {
      assert.equal(Math.sign(t.pnl), dir, `trade pnl sign should match exit-entry: ${JSON.stringify(t)}`);
      assert.equal(Math.sign(t.pnlPct), dir, `trade pnlPct sign should match exit-entry: ${JSON.stringify(t)}`);
    }
    // no look-ahead: entry/exit dates exist in the bars and exit index >= entry index
    const ei = idxOf[t.entryDate], xi = idxOf[t.exitDate];
    assert.ok(ei != null, `entry date ${t.entryDate} must exist in bars`);
    assert.ok(xi != null, `exit date ${t.exitDate} must exist in bars`);
    assert.ok(xi >= ei, `exit index ${xi} must be >= entry index ${ei}`);
  }
  return bt;
}

test("backtest invariants on the cyclical demo (countdown-only triggers)", () => {
  const bars = demoBars();
  const r = computeDeMark(bars);
  const bt = assertBacktestInvariants(bars, r.signals, { capital: 10000, useSetups: false });
  assert.ok(bt.stats.nTrades >= 0);
});

test("backtest invariants with a completed countdown (countdown-only triggers, trending fixture)", () => {
  // The demo no longer completes a countdown post-fidelity; use a sustained
  // downtrend (which completes a buy CD) so the countdown-only path is exercised.
  const closes = []; for (let i = 0; i < 40; i++) closes.push(200 - i * 2);
  const bars = barsFromCloses(closes, { wickHi: 0.3, wickLo: 0.3 });
  const r = computeDeMark(bars);
  assert.ok(r.signals.some((s) => s.type === "BUY_COUNTDOWN"), "fixture should complete a buy countdown");
  const bt = assertBacktestInvariants(bars, r.signals, { capital: 10000, useSetups: false });
  assert.ok(bt.stats.nTrades > 0, "countdown-only backtest should trade on a completed countdown");
});

test("backtest invariants on the cyclical demo (setups + countdowns)", () => {
  const bars = demoBars();
  const r = computeDeMark(bars);
  const bt = assertBacktestInvariants(bars, r.signals, { capital: 10000, useSetups: true });
  assert.ok(bt.stats.nTrades > 0, "the setups+countdowns variant should trigger trades on the demo");
});

test("backtest exposure/winRate stay within sane bounds", () => {
  const bars = demoBars();
  const r = computeDeMark(bars);
  const bt = backtest(bars, r.signals, { capital: 10000, useSetups: true });
  assert.ok(bt.stats.exposurePct >= 0 && bt.stats.exposurePct <= 100, "exposure 0..100%");
  assert.ok(bt.stats.winRate >= 0 && bt.stats.winRate <= 100, "win rate 0..100%");
  assert.ok(bt.stats.maxDDPct >= 0, "max drawdown non-negative");
});

/* --------------------------------------------- backtest look-ahead (P0-3) */

/** Deterministic deferred buy setup: completes (bar 9) at idx 12 but is NOT
 *  perfected there; a later bar (idx 13) breaches the bar-6/7 low ref and
 *  perfects it (perfIdx 13). A look-ahead-free backtest must enter at the
 *  perfecting bar's date, never at the bar-9 date. */
function deferredSetupBars() {
  const closes = [100, 100, 100, 100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 91.5, 88];
  const bars = closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1];
    const t = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    return { t, o: +o.toFixed(2), h: +(Math.max(o, c) + 0.5).toFixed(2), l: +(Math.min(o, c) - 0.5).toFixed(2), c: +c.toFixed(2), v: 1000 };
  });
  // Lift bars 11 & 12 lows above the bar-6/7 ref so bar-9 perfection fails...
  bars[11].l = 94.0; bars[12].l = 93.5;
  // ...then bar 13 dips below the ref (92.5) to perfect it; bar 14 keeps falling.
  bars[13].l = 92.0; bars[14].l = 87.5;
  return bars;
}

test("backtest enters a deferred setup at perfIdx, not bar 9 (no look-ahead, P0-3)", () => {
  const bars = deferredSetupBars();
  const r = computeDeMark(bars);
  const setup = r.signals.find((s) => s.type === "BUY_SETUP");
  assert.ok(setup, "fixture must produce a buy setup");
  assert.equal(setup.idx, 12, "bar-9 completion index");
  assert.equal(setup.perfIdx, 13, "deferred perfection index (later than bar 9)");
  assert.ok(setup.perfIdx > setup.idx, "perfIdx must be after the bar-9 idx");

  const bt = backtest(bars, r.signals, { capital: 10000, useSetups: true });
  const entries = bt.trades.map((t) => t.entryDate);
  assert.ok(entries.includes(bars[setup.perfIdx].t), "entry must occur on the perfecting bar's date");
  assert.ok(!entries.includes(bars[setup.idx].t), "entry must NOT occur on the bar-9 date (would be look-ahead)");
});

/* ============================================================
   TD-fidelity rule lock-in tests (P1-1..P1-4, P2-1..P2-3)
   ============================================================ */

/* ---- P1-1: a Setup may only INITIATE on a price flip ---- */

test("P1-1 flip-required: a single uninterrupted down-run produces only ONE buy setup (no back-to-back without a flip)", () => {
  // 4 priming bars, then 18 strictly-falling closes = one continuous down-count.
  // The old engine restarted counting after bar 9 and emitted a 2nd setup; the
  // flip rule forbids re-initiation without an intervening up-flip.
  const closes = [100, 100, 100, 100];
  for (let i = 0; i < 18; i++) closes.push(99 - i);
  const bars = barsFromCloses(closes);
  const r = computeDeMark(bars);
  const buySetups = r.signals.filter((s) => s.type === "BUY_SETUP");
  assert.equal(buySetups.length, 1, "an unbroken down-run must yield exactly one buy setup");
  assert.equal(buySetups[0].idx, 12, "the single setup completes at the bar-9 index (12)");
});

test("P1-1 flip-required mirror: a single uninterrupted up-run produces only ONE sell setup", () => {
  const closes = [100, 100, 100, 100];
  for (let i = 0; i < 18; i++) closes.push(101 + i);
  const bars = barsFromCloses(closes);
  const r = computeDeMark(bars);
  const sellSetups = r.signals.filter((s) => s.type === "SELL_SETUP");
  assert.equal(sellSetups.length, 1, "an unbroken up-run must yield exactly one sell setup");
  assert.equal(sellSetups[0].idx, 12);
});

test("P1-1 flip-required: a second same-direction setup CAN start after an intervening opposite flip", () => {
  // down9 (buy setup #1), then a strong up-leg (opposite/up flip + sell setup),
  // then down9 again (buy setup #2). Two buy setups are now legal.
  const closes = [100, 100, 100, 100, 99, 98, 97, 96, 95, 94, 93, 92, 91];   // buy setup @12
  for (let i = 0; i < 9; i++) closes.push(130 + i);                          // up flip + sell setup
  for (let i = 0; i < 9; i++) closes.push(129 - i);                          // buy setup #2
  const bars = barsFromCloses(closes);
  const r = computeDeMark(bars);
  // Note: signals come from a vm sandbox realm, so their Array prototype differs
  // from this realm's — join to a string for a realm-safe comparison.
  const buySetups = r.signals.filter((s) => s.type === "BUY_SETUP").map((s) => s.idx);
  const sellSetups = r.signals.filter((s) => s.type === "SELL_SETUP").map((s) => s.idx);
  assert.equal(buySetups.length, 2, "two buy setups, separated by an up-flip, are allowed");
  assert.equal(buySetups.join(","), "12,30");
  assert.ok(sellSetups.length >= 1, "the intervening up-leg completes a sell setup (the flip)");
});

/* ---- P1-2: TDST-break cancels an in-progress Countdown ---- */

test("P1-2 TDST cancellation: a close above the buy-setup TDST resistance cancels the buy countdown", () => {
  // Long fall completes a buy setup and begins a countdown; a single spike close
  // far above the setup's resistance cancels it, so no BUY_COUNTDOWN completes
  // even though price then resumes falling.
  const closes = [100, 100, 100, 100];
  for (let i = 0; i < 13; i++) closes.push(99 - i);   // buy setup @12, CD begins
  closes.push(150);                                   // close >> setup TDST -> cancel
  for (let i = 0; i < 20; i++) closes.push(85 - i);   // resume falling
  const bars = barsFromCloses(closes, { wickHi: 0.3, wickLo: 0.3 });
  const r = computeDeMark(bars);
  assert.equal(r.signals.filter((s) => s.type === "BUY_COUNTDOWN").length, 0,
    "the TDST-break must cancel the buy countdown");

  // Control: WITHOUT the spike (price keeps falling), the countdown DOES complete.
  const ctrl = [100, 100, 100, 100];
  for (let i = 0; i < 40; i++) ctrl.push(99 - i);
  const rc = computeDeMark(barsFromCloses(ctrl, { wickHi: 0.3, wickLo: 0.3 }));
  assert.ok(rc.signals.some((s) => s.type === "BUY_COUNTDOWN"),
    "without a TDST break the buy countdown completes (proves the spike caused the cancel)");
});

test("P1-2 TDST cancellation mirror: a close below the sell-setup TDST support cancels the sell countdown", () => {
  const closes = [100, 100, 100, 100];
  for (let i = 0; i < 13; i++) closes.push(101 + i);  // sell setup @12, CD begins
  closes.push(50);                                    // close << setup TDST -> cancel
  for (let i = 0; i < 20; i++) closes.push(120 + i);  // resume rising
  const bars = barsFromCloses(closes, { wickHi: 0.3, wickLo: 0.3 });
  const r = computeDeMark(bars);
  assert.equal(r.signals.filter((s) => s.type === "SELL_COUNTDOWN").length, 0,
    "the TDST-break must cancel the sell countdown");
});

/* ---- P1-3: recycle resets an in-progress Countdown ---- */

test("P1-3 recycle: the buy countdown count resets when the raw down-run reaches the recycle threshold (18)", () => {
  // A 40-bar monotonic fall. The buy CD counts 1..9, but at the bar where the
  // raw down-run hits 18 the recycle rule resets it to 1 (visible in the buyCD
  // annotation dropping back to 1), so completion is pushed later than it would
  // be without recycling.
  const closes = [];
  for (let i = 0; i < 40; i++) closes.push(200 - i * 2);
  const bars = barsFromCloses(closes, { wickHi: 0.3, wickLo: 0.3 });
  const r = computeDeMark(bars);
  const cdAnn = r.ann.map((a) => a.buyCD);
  const runAnn = r.ann.map((a) => a.buyRun);

  const recycleBar = runAnn.indexOf(18);
  assert.ok(recycleBar > 0, "the raw run should reach the recycle threshold");
  // the count immediately before the recycle bar was 9; at the recycle bar it
  // restarts at 1 (rather than continuing to 10).
  assert.equal(cdAnn[recycleBar - 1], 9, "count was 9 the bar before the recycle threshold");
  assert.equal(cdAnn[recycleBar], 1, "count resets to 1 at the recycle threshold (P1-3)");

  // and a single, post-recycle countdown still completes (count 13 exists once).
  const cds = r.signals.filter((s) => s.type === "BUY_COUNTDOWN");
  assert.equal(cds.length, 1, "exactly one (post-recycle) buy countdown completes");
});

/* ---- P1-4: countdown risk-stop window spans the TRUE countdown range ---- */

test("P1-4 countdown stop window spans the real countdown range (bar1..bar13), not the last 13 calendar bars", () => {
  // Monotonic fall -> a buy countdown completes at some idx. The risk stop is
  // taken over the actual countdown span (bar1..bar13). Because countdown bars
  // here are consecutive after the recycle, the extreme bar is the last one, and
  // the stop reflects the bar-13 low minus its true range — strictly below entry.
  const closes = [];
  for (let i = 0; i < 40; i++) closes.push(200 - i * 2);
  const bars = barsFromCloses(closes, { wickHi: 0.3, wickLo: 0.3 });
  const r = computeDeMark(bars);
  const cd = r.signals.find((s) => s.type === "BUY_COUNTDOWN");
  assert.ok(cd, "fixture should complete a buy countdown");
  assert.ok(cd.risk.stop < cd.price, "buy countdown stop must be below entry");
  assert.ok(cd.risk.riskPerShare > 0, "buy countdown must carry positive risk");
  // The stop must be no higher than the bar-13 low (the deepest bar in the span).
  assert.ok(cd.risk.stop <= bars[cd.idx].l, "stop must sit at/below the deepest countdown-bar low");
});

/* ---- P2-2: TRUE range (not bar range) drives the stop ---- */

test("P2-2 riskLevels uses TRUE range (prior-close gap) for the extreme bar, not bar range", () => {
  // 5 bars; the last is a gap-down extreme: prevClose 96 sits above its high 91.
  // bar range = 91-89 = 2 -> bar-range stop would be 89-2 = 87.
  // true range = max(91,96)-min(89,96) = 7 -> TR stop = 89-7 = 82.
  const mk = (t, o, h, l, c) => ({ t, o, h, l, c, v: 1 });
  const bars = [
    mk("2026-01-01", 100, 100, 99, 99),
    mk("2026-01-02", 99, 99, 98, 98),
    mk("2026-01-03", 98, 98, 97, 97),
    mk("2026-01-04", 97, 97, 96, 96),
    mk("2026-01-05", 90, 91, 89, 90),   // gap down vs prevClose 96
  ];
  const buy = riskLevels("buy", bars, 0, bars.length - 1);
  assert.equal(buy.stop, 82, "stop must use TRUE range (82), not bar range (87)");
  assert.equal(buy.riskPerShare, +(90 - 82).toFixed(2), "riskPerShare reflects the true-range stop");

  // Sell mirror: gap-up extreme; prevClose below the bar low.
  const sbars = [
    mk("2026-01-01", 100, 101, 100, 100),
    mk("2026-01-02", 100, 102, 101, 101),
    mk("2026-01-03", 101, 103, 102, 102),
    mk("2026-01-04", 102, 104, 103, 103),
    mk("2026-01-05", 110, 111, 109, 110), // gap up vs prevClose 103
  ];
  // extreme high bar = last (111). prevClose 103. TR = max(111,103)-min(109,103)=8.
  // stop = 111 + 8 = 119 (bar range would be 111 + 2 = 113).
  const sell = riskLevels("sell", sbars, 0, sbars.length - 1);
  assert.equal(sell.stop, 119, "sell stop must use TRUE range (119), not bar range (113)");
});

/* ---- P2-3: deferred-perfection boundary off-by-one (j < limit) ---- */

/** Buy setup at idx 12 left unperfected at bar 9; an opposing sell setup
 *  completes at idx 21. `breachIdx` is the only bar whose low breaches the
 *  buy perfRef. */
function p23Bars(breachIdx) {
  const closes = [100, 100, 100, 100, 99, 98, 97, 96, 95, 94, 93, 92, 91];
  for (let i = 0; i < 9; i++) closes.push(95 + i * 4); // up-leg -> sell setup @21
  const mk = (t, o, h, l, c) => ({ t, o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2), v: 1 });
  const bars = closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1];
    const t = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
    return mk(t, o, Math.max(o, c) + 0.5, Math.min(o, c) - 0.5, c);
  });
  bars[9].l = 93.0; bars[10].l = 93.0;      // perfRef = min(low9,low10) = 93.0
  bars[11].l = 93.5; bars[12].l = 93.5;     // bar8/9 lows above ref -> NOT perfected at 9
  for (let i = 13; i <= 21; i++) bars[i].l = Math.max(bars[i].l, 94.0); // no breach by default
  bars[breachIdx].l = 92.0;                 // the single breaching bar
  return bars;
}

test("P2-3 boundary: a breach EXACTLY on the opposing setup's completion bar does NOT perfect (j < limit)", () => {
  const bars = p23Bars(21);                 // breach lands on the sell-completion bar
  const r = computeDeMark(bars);
  const buy = r.signals.find((s) => s.type === "BUY_SETUP");
  const sell = r.signals.find((s) => s.type === "SELL_SETUP");
  assert.equal(buy.idx, 12);
  assert.equal(sell.idx, 21, "opposing sell setup completes at idx 21");
  assert.equal(buy.perfected, false, "breach on the opposing-completion bar must NOT perfect (j < limit)");
  assert.equal(buy.perfIdx, undefined, "no perfIdx when the only breach is the boundary bar");
});

test("P2-3 control: a breach one bar BEFORE the opposing completion DOES perfect (proves the off-by-one)", () => {
  const bars = p23Bars(20);                 // breach one bar before the sell completion
  const r = computeDeMark(bars);
  const buy = r.signals.find((s) => s.type === "BUY_SETUP");
  assert.equal(buy.perfected, true, "a breach strictly before the opposing setup perfects the earlier setup");
  assert.equal(buy.perfIdx, 20, "perfection occurs at the breaching bar (idx 20)");
});
