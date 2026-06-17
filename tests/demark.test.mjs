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

/** Replay the buy-countdown pass to recover the close of countdown-bar 8 for
 *  each completed buy CD-13, so tests can assert the bar-13 <= close8 rule. */
function reconBuyCD(bars) {
  const r = computeDeMark(bars);
  const c = bars.map((b) => b.c), l = bars.map((b) => b.l);
  const ann = r.ann;
  let buyCD = null;
  const out = [];
  for (let i = 0; i < bars.length; i++) {
    const f = ann[i].setupFlag;
    if (f && f.dir === "buy" && !buyCD) buyCD = { count: 0, close8: null };
    if (f && f.dir === "sell") buyCD = null;
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
    if (f && f.dir === "sell" && !sellCD) sellCD = { count: 0, close8: null };
    if (f && f.dir === "buy") sellCD = null;
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

test("Countdown 13 qualifier holds for every countdown in the cyclical demo", () => {
  const bars = demoBars();
  const r = computeDeMark(bars);
  const c = bars.map((b) => b.c), h = bars.map((b) => b.h), l = bars.map((b) => b.l);

  const buyCDs = r.signals.filter((s) => s.type === "BUY_COUNTDOWN");
  const sellCDs = r.signals.filter((s) => s.type === "SELL_COUNTDOWN");
  assert.ok(buyCDs.length > 0 && sellCDs.length > 0, "demo should produce both buy and sell countdowns");

  for (const sg of buyCDs) assert.ok(c[sg.idx] <= l[sg.idx - 2], `buy CD ${sg.idx}: close not <= low[-2]`);
  for (const sg of sellCDs) assert.ok(c[sg.idx] >= h[sg.idx - 2], `sell CD ${sg.idx}: close not >= high[-2]`);

  // bar-13 vs close8 via reconstruction
  for (const { idx, close8 } of reconBuyCD(bars)) assert.ok(l[idx] <= close8, `buy CD ${idx}: low not <= close8`);
  for (const { idx, close8 } of reconSellCD(bars)) assert.ok(h[idx] >= close8, `sell CD ${idx}: high not >= close8`);
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

test("riskLevels: degenerate window yields riskPerShare:null, never a wrong-side stop (P0-4)", () => {
  // Buy: the only bar has high==low (tr=0) and low==entry close, so stop would
  // equal entry → no positive risk and the stop is NOT below entry. Expect null.
  const flat = [{ t: "2026-01-01", o: 100, h: 100, l: 100, c: 100, v: 1 }];
  const buy = riskLevels("buy", flat, 0, 0);
  assert.equal(buy.riskPerShare, null, "no valid buy stop ⇒ riskPerShare:null");
  assert.ok(!(buy.stop < buy.target && buy.riskPerShare > 0), "must not report a wrong-side/zero-risk buy stop");

  // Sell mirror.
  const sell = riskLevels("sell", flat, 0, 0);
  assert.equal(sell.riskPerShare, null, "no valid sell stop ⇒ riskPerShare:null");

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
