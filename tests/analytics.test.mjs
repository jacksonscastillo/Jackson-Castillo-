// Tests for the new pure analytics + export helpers added in Dashboard v2:
//   dataQuality, drawdownSeries, periodReturns, atrSeries,
//   csvField, tradesToCSV, equityToCSV.
// These are pure (no DOM), sliced out of the page's <script> block. The HTML is
// never modified. parseBarDate is a dependency of dataQuality/periodReturns, so
// it is sliced in too.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEngine, barsFromCloses } from "./_engine.mjs";

const eng = loadEngine([
  "parseBarDate", "dataQuality", "drawdownSeries", "periodReturns",
  "atrSeries", "csvField", "tradesToCSV", "equityToCSV",
]);
const { dataQuality, drawdownSeries, periodReturns, atrSeries, csvField, tradesToCSV, equityToCSV } = eng;

/* ----------------------------------------------------------- dataQuality */

test("dataQuality: counts bars and reports an ISO date range", () => {
  const bars = barsFromCloses(Array.from({ length: 30 }, (_, i) => 100 + i));
  const q = dataQuality(bars);
  assert.equal(q.count, 30);
  assert.equal(q.first, bars[0].t);
  assert.equal(q.last, bars[29].t);
  assert.equal(q.datesParsed, true);
  assert.equal(q.medianGapDays, 1, "barsFromCloses steps one day");
  assert.equal(q.warnings.length, 0, "clean daily data has no warnings");
});

test("dataQuality: flags a large date gap", () => {
  const bars = barsFromCloses(Array.from({ length: 25 }, (_, i) => 100 + i));
  // Blow a big hole: push everything after index 12 forward ~90 days.
  for (let i = 13; i < bars.length; i++) {
    const d = new Date(bars[i].t + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + 90);
    bars[i].t = d.toISOString().slice(0, 10);
  }
  const q = dataQuality(bars);
  assert.ok(q.maxGapDays > 80, "max gap should reflect the hole");
  assert.ok(q.warnings.some((w) => /gap/i.test(w)), "a gap warning should be present");
});

test("dataQuality: empty input degrades gracefully", () => {
  const q = dataQuality([]);
  assert.equal(q.count, 0);
  assert.equal(q.first, null);
  assert.equal(q.datesParsed, false);
  assert.equal(q.warnings.length, 0);
});

/* --------------------------------------------------------- drawdownSeries */

test("drawdownSeries: dd is 0 at new peaks and positive below peak", () => {
  const eq = [{ t: "2026-01-01", value: 100 }, { t: "2026-01-02", value: 120 }, { t: "2026-01-03", value: 90 }, { t: "2026-01-04", value: 132 }];
  const dd = drawdownSeries(eq);
  assert.equal(dd[0].dd, 0);
  assert.equal(dd[1].dd, 0, "new peak -> 0 dd");
  assert.equal(+dd[2].dd.toFixed(4), 25, "90 vs peak 120 -> 25% drawdown");
  assert.equal(dd[3].dd, 0, "new peak -> 0 dd");
});

test("drawdownSeries: never negative, [] for empty", () => {
  assert.equal(drawdownSeries([]).length, 0);
  const dd = drawdownSeries([{ t: "x", value: 50 }, { t: "y", value: 200 }]);
  assert.ok(dd.every((d) => d.dd >= 0));
});

/* --------------------------------------------------------- periodReturns */

test("periodReturns: yearly buckets compute lastValue/firstValue-1", () => {
  const eq = [
    { t: "2025-01-02", value: 100 }, { t: "2025-12-31", value: 110 },
    { t: "2026-01-02", value: 110 }, { t: "2026-12-31", value: 99 },
  ];
  const rows = periodReturns(eq, "year");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].period, "2025");
  assert.equal(+rows[0].pct.toFixed(4), 10);
  assert.equal(rows[1].period, "2026");
  assert.equal(+rows[1].pct.toFixed(4), -10);
});

test("periodReturns: monthly grain and unparseable dates skipped", () => {
  const eq = [
    { t: "2026-01-01", value: 100 }, { t: "2026-01-31", value: 105 },
    { t: "bad-date", value: 999 },
    { t: "2026-02-01", value: 105 }, { t: "2026-02-28", value: 100 },
  ];
  const rows = periodReturns(eq, "month");
  assert.equal(rows.length, 2);
  assert.equal(rows[0].period, "2026-01");
  assert.equal(+rows[0].pct.toFixed(2), 5);
});

test("periodReturns: empty input -> []", () => {
  assert.equal(periodReturns([], "year").length, 0);
});

/* -------------------------------------------------------------- atrSeries */

test("atrSeries: nulls before period, positive thereafter", () => {
  const bars = barsFromCloses(Array.from({ length: 40 }, (_, i) => 100 + (i % 5)));
  const atr = atrSeries(bars, 14);
  assert.equal(atr.length, bars.length);
  for (let i = 0; i < 14; i++) assert.equal(atr[i], null, "no ATR before the period fills");
  assert.ok(atr[14] != null && atr[14] > 0, "ATR available at index = period");
  assert.ok(atr.slice(15).every((v) => v != null && v > 0));
});

test("atrSeries: tiny input degrades to all-null", () => {
  const atr = atrSeries(barsFromCloses([100, 101, 102]), 14);
  assert.ok(atr.every((v) => v === null));
});

/* ----------------------------------------------------------- CSV exporters */

test("csvField: quotes fields with commas/quotes/newlines", () => {
  assert.equal(csvField("plain"), "plain");
  assert.equal(csvField("a,b"), '"a,b"');
  assert.equal(csvField('he said "hi"'), '"he said ""hi"""');
  assert.equal(csvField(12.5), "12.5");
  assert.equal(csvField(null), "");
});

test("tradesToCSV: stable header + one row per trade", () => {
  const trades = [
    { entryDate: "2026-01-01", entryPx: 100, exitDate: "2026-01-05", exitPx: 110, shares: 3, reason: "target", pnl: 30, pnlPct: 10, holdDays: 4 },
  ];
  const csv = tradesToCSV(trades);
  const lines = csv.split("\n");
  assert.equal(lines[0], "entryDate,entryPx,exitDate,exitPx,shares,reason,pnl,pnlPct,holdDays");
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^2026-01-01,100,2026-01-05,110,3,target,30,10,4$/);
});

test("tradesToCSV: header-only for no trades", () => {
  assert.equal(tradesToCSV([]).split("\n").length, 1);
  assert.equal(tradesToCSV([]), "entryDate,entryPx,exitDate,exitPx,shares,reason,pnl,pnlPct,holdDays");
});

test("equityToCSV: date,equity rows", () => {
  const csv = equityToCSV([{ t: "2026-01-01", value: 100 }, { t: "2026-01-02", value: 101.5 }]);
  assert.equal(csv, "date,equity\n2026-01-01,100\n2026-01-02,101.5");
});
