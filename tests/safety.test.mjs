// Tests for the P0 safety helpers added in this change:
//   P0-2 isThinSample  — flag thin-sample statistics (<30 trades)
//   P0-3 symbolMismatch — symbol-integrity guard (JSON vs input field)
//   P0-5 staleness      — wall-clock staleness vs the browser's current date
// All three are pure functions sliced straight out of the page's <script>.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEngine } from "./_engine.mjs";

const eng = loadEngine(["isThinSample", "symbolMismatch", "parseBarDate", "staleness"]);
const { isThinSample, symbolMismatch, staleness } = eng;

/* ---------------------------------------------------- P0-2 thin sample */

test("isThinSample: true below 30 trades, false at/above", () => {
  assert.equal(isThinSample(0), true);
  assert.equal(isThinSample(29), true);
  assert.equal(isThinSample(30), false);
  assert.equal(isThinSample(100), false);
});

test("isThinSample: handles non-finite gracefully (treated as thin)", () => {
  assert.equal(isThinSample(NaN), true);
  assert.equal(isThinSample(undefined), true);
});

/* ------------------------------------------------- P0-3 symbol integrity */

test("symbolMismatch: flags disagreeing non-empty symbols", () => {
  const r = symbolMismatch("DEMO", "ZZZ");
  assert.equal(r.mismatch, true);
  assert.equal(r.jsonSymbol, "DEMO");
  assert.equal(r.inputSymbol, "ZZZ");
});

test("symbolMismatch: case/whitespace-insensitive match is NOT a mismatch", () => {
  assert.equal(symbolMismatch(" aapl ", "AAPL").mismatch, false);
  assert.equal(symbolMismatch("AAPL", "aapl").mismatch, false);
});

test("symbolMismatch: missing JSON symbol (e.g. CSV) is never a mismatch", () => {
  assert.equal(symbolMismatch(null, "AAPL").mismatch, false);
  assert.equal(symbolMismatch("", "AAPL").mismatch, false);
  assert.equal(symbolMismatch(undefined, "AAPL").mismatch, false);
});

test("symbolMismatch: empty input field is never a mismatch", () => {
  assert.equal(symbolMismatch("AAPL", "").mismatch, false);
});

/* ------------------------------------------------------- P0-5 staleness */

const DAY = 86400000;

test("staleness: fresh data (today) is not stale", () => {
  const now = Date.UTC(2026, 5, 25);
  const r = staleness("2026-06-25", now, 5);
  assert.equal(r.stale, false);
  assert.equal(r.ageDays, 0);
});

test("staleness: data well past the trading-day budget is stale", () => {
  const now = Date.UTC(2026, 5, 25);
  // 20 days old, way beyond ~5 trading days
  const r = staleness("2026-06-05", now, 5);
  assert.equal(r.stale, true);
  assert.equal(r.ageDays, 20);
});

test("staleness: a few days old (within a trading week + cushion) is not stale", () => {
  const now = Date.UTC(2026, 5, 25);
  // 3 calendar days — inside the calendar budget for 5 trading days.
  const r = staleness("2026-06-22", now, 5);
  assert.equal(r.stale, false);
});

test("staleness: unparseable date yields ageDays null, not stale", () => {
  const r = staleness("not-a-date", Date.now(), 5);
  assert.equal(r.ageDays, null);
  assert.equal(r.stale, false);
});

test("staleness: honors a custom trading-day threshold", () => {
  const now = Date.UTC(2026, 5, 25);
  // 10 calendar days old; budget for 1 trading day (~3 cal incl cushion) → stale.
  assert.equal(staleness("2026-06-15", now, 1).stale, true);
  // same age, generous 30-trading-day budget → not stale.
  assert.equal(staleness("2026-06-15", now, 30).stale, false);
});
