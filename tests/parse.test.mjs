// Parser tests for parseBars / parseCSV from demark-trading.html.
//
// Both functions read document.getElementById('symbol').value for a fallback
// symbol, so we stub a minimal `document`. The HTML is never modified; the
// functions are sliced out of its <script> block (see tests/_engine.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEngine } from "./_engine.mjs";

// Stub: every getElementById returns an element whose .value is 'TEST'.
const eng = loadEngine(["parseBars", "parseCSV"], {
  document: { getElementById: () => ({ value: "TEST" }) },
});
const { parseBars } = eng;

/* ---------------------------------------------------------------- JSON */

test("parseBars: JSON array form (>=20 bars) with t/o/h/l/c/v keys", () => {
  const arr = [];
  for (let i = 0; i < 20; i++) {
    arr.push({ t: `2026-01-${String(i + 1).padStart(2, "0")}`, o: 100 + i, h: 101 + i, l: 99 + i, c: 100.5 + i, v: 1000 + i });
  }
  const r = parseBars(JSON.stringify(arr));
  assert.equal(r.bars.length, 20);
  assert.equal(r.symbol, "TEST", "bare array falls back to the symbol input value");
  assert.equal(r.bars[0].t, "2026-01-01");
  assert.equal(r.bars[0].c, 100.5);
  assert.equal(r.bars[19].v, 1019);
});

test("parseBars: JSON object form {symbol, bars:[...]} keeps its own symbol", () => {
  const arr = [];
  for (let i = 0; i < 20; i++) {
    arr.push({ date: `2026-01-${String(i + 1).padStart(2, "0")}`, open: 100 + i, high: 101 + i, low: 99 + i, close: 100.5 + i });
  }
  const r = parseBars(JSON.stringify({ symbol: "ZZZ", timeframe: "1day", bars: arr }));
  assert.equal(r.symbol, "ZZZ");
  assert.equal(r.bars.length, 20);
  // alt key names (open/high/low/close) are accepted
  assert.equal(r.bars[0].o, 100);
  assert.equal(r.bars[0].c, 100.5);
});

test("parseBars: JSON also accepts open_price/high_price/... Robinhood keys", () => {
  const arr = [];
  for (let i = 0; i < 20; i++) {
    arr.push({ begins_at: `2026-04-${String(i + 1).padStart(2, "0")}`, open_price: 50 + i, high_price: 52 + i, low_price: 48 + i, close_price: 51 + i, volume: 7 });
  }
  const r = parseBars(JSON.stringify(arr));
  assert.equal(r.bars.length, 20);
  assert.equal(r.bars[0].o, 50);
  assert.equal(r.bars[0].c, 51);
  assert.equal(r.bars[0].v, 7);
});

test("parseBars: fewer than 20 bars throws", () => {
  const arr = [];
  for (let i = 0; i < 5; i++) arr.push({ t: `2026-01-0${i + 1}`, o: 1, h: 2, l: 0.5, c: 1.5, v: 1 });
  assert.throws(() => parseBars(JSON.stringify(arr)), /at least 20 bars/);
});

/* ---------------------------------------------------------------- CSV */

test("parseCSV: Yahoo export, newest-first, Adj Close + Volume -> ascending after parse", () => {
  const header = "Date,Open,High,Low,Close,Adj Close,Volume";
  const rows = [];
  for (let i = 0; i < 25; i++) {
    const d = `2026-02-${String(i + 1).padStart(2, "0")}`;
    // Adj Close intentionally differs from Close so we can confirm which column wins.
    rows.push(`${d},${100 + i},${101 + i},${99 + i},${100.5 + i},${200 + i},${1000 + i}`);
  }
  // Yahoo exports are typically newest-first; feed reversed.
  const csv = header + "\n" + rows.slice().reverse().join("\n");
  const r = parseBars(csv);

  assert.equal(r.bars.length, 25);
  const ascending = r.bars.every((b, i) => i === 0 || b.t >= r.bars[i - 1].t);
  assert.ok(ascending, "newest-first CSV must be sorted ascending by date after parse");
  assert.equal(r.bars[0].t, "2026-02-01");
  assert.equal(r.bars[r.bars.length - 1].t, "2026-02-25");
  // 'close' is matched before 'adj close' in the column resolver, so Close wins.
  assert.equal(r.bars[0].c, 100.5, "Close column should be used (resolved before Adj Close)");
  assert.equal(r.bars[0].v, 1000, "Volume column should be parsed");
});

test("parseCSV: Nasdaq export with $, quotes, and Close/Last header", () => {
  const header = "Date,Close/Last,Volume,Open,High,Low";
  const rows = [];
  for (let i = 0; i < 22; i++) {
    const d = `2026-05-${String(i + 1).padStart(2, "0")}`;
    rows.push(`${d},"$${100 + i}","${1000 + i}","$${99.5 + i}","$${101 + i}","$${98 + i}"`);
  }
  const csv = header + "\n" + rows.join("\n");
  const r = parseBars(csv);

  assert.equal(r.bars.length, 22);
  // $, quotes stripped; Close/Last maps to close.
  assert.equal(r.bars[0].c, 100);
  assert.equal(r.bars[0].o, 99.5);
  assert.equal(r.bars[0].h, 101);
  assert.equal(r.bars[0].l, 98);
  assert.equal(r.bars[0].v, 1000);
});

test("parseCSV: semicolon-delimited export", () => {
  const header = "date;open;high;low;close;volume";
  const rows = [];
  for (let i = 0; i < 21; i++) {
    rows.push(`2026-03-${String(i + 1).padStart(2, "0")};${100 + i};${101 + i};${99 + i};${100.2 + i};${500 + i}`);
  }
  const csv = header + "\n" + rows.join("\n");
  const r = parseBars(csv);

  assert.equal(r.bars.length, 21);
  assert.equal(r.bars[0].c, 100.2);
  assert.equal(r.bars[0].v, 500);
});

test("parseCSV: fewer than 20 data rows throws", () => {
  const csv = "Date,Open,High,Low,Close\n2026-01-01,1,2,0.5,1.5\n2026-01-02,1,2,0.5,1.5";
  assert.throws(() => parseBars(csv), /at least 20 bars/);
});

test("parseCSV: missing required OHLC columns throws", () => {
  const rows = [];
  for (let i = 0; i < 21; i++) rows.push(`2026-01-${String(i + 1).padStart(2, "0")},1,2`);
  const csv = "Date,Open,High\n" + rows.join("\n");
  assert.throws(() => parseBars(csv), /must include open, high, low, close/);
});
