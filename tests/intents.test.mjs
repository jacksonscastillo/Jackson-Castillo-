// Order-intent tests for buildIntents from demark-trading.html.
//
// buildIntents reads wallet/risk via num(id) -> document.getElementById(id).value,
// so we stub a minimal `document` keyed by element id. The HTML is never
// modified; the functions are sliced out of its <script> block (see _engine.mjs).
//
// Covers the safety hardening:
//   P0-2  no degenerate intents (qty<=0, null risk, wallet/risk<=0 -> [])
//   P0-1  sells are position-aware EXITS (reduceOnly/closeLong/action), no short size
//   P1-5  staleness guard — only signals within the last 5 bars are emitted
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadEngine } from "./_engine.mjs";

// Build an engine sandbox with a tweakable element store. Tests set values via
// `els` before calling buildIntents.
function makeEngine(els) {
  return loadEngine(["num", "buildIntents"], {
    document: { getElementById: (id) => ({ value: els[id] }) },
    Date, // buildIntents calls new Date().toISOString()
    isFinite,
    Object,
    Math,
    JSON,
  });
}

// A perfected buy setup signal with a valid risk block.
function buySig(idx, opts = {}) {
  return {
    type: "BUY_SETUP", side: "buy", label: "Buy Setup 9", idx,
    date: `2026-01-${String(idx + 1).padStart(2, "0")}`, price: 100, perfected: true,
    risk: { stop: 95, target: 110, riskPerShare: 5, ...(opts.risk || {}) },
    ...opts,
  };
}
// A perfected sell setup signal.
function sellSig(idx, opts = {}) {
  return {
    type: "SELL_SETUP", side: "sell", label: "Sell Setup 9", idx,
    date: `2026-02-${String(idx + 1).padStart(2, "0")}`, price: 100, perfected: true,
    risk: { stop: 105, target: 90, riskPerShare: 5, ...(opts.risk || {}) },
    ...opts,
  };
}
// Minimal ascending bars so buildIntents can read latest close + age-gate.
function barsN(n, lastClose = 100) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ t: `2026-03-${String(i + 1).padStart(2, "0")}`, o: 100, h: 101, l: 99, c: i === n - 1 ? lastClose : 100, v: 1 });
  return out;
}

/* ------------------------------------------------------ P0-2 degenerate */

test("buildIntents: wallet <= 0 returns [] (P0-2)", () => {
  const { buildIntents } = makeEngine({ wallet: "0", risk: "1" });
  const bars = barsN(10);
  assert.equal(buildIntents("AAA", [buySig(9)], bars).length, 0);
});

test("buildIntents: risk <= 0 returns [] (P0-2)", () => {
  const { buildIntents } = makeEngine({ wallet: "10000", risk: "0" });
  const bars = barsN(10);
  assert.equal(buildIntents("AAA", [buySig(9)], bars).length, 0);
});

test("buildIntents: no intent with quantity <= 0 (P0-2)", () => {
  const { buildIntents } = makeEngine({ wallet: "10000", risk: "1" });
  const bars = barsN(10);
  const out = buildIntents("AAA", [buySig(9)], bars);
  for (const it of out) {
    if (it.side === "buy") assert.ok(isFinite(it.quantity) && it.quantity > 0, `buy qty must be > 0: ${JSON.stringify(it)}`);
  }
});

test("buildIntents: drops a buy whose riskPerShare is null (P0-2 / P0-4 sentinel)", () => {
  const { buildIntents } = makeEngine({ wallet: "10000", risk: "1" });
  const bars = barsN(10);
  const bad = buySig(9, { risk: { stop: 95, target: 110, riskPerShare: null } });
  assert.equal(buildIntents("AAA", [bad], bars).length, 0, "null risk must be filtered out");
});

/* -------------------------------------------------- P0-1 sells are exits */

test("buildIntents: sell signal is a position-aware EXIT, no fabricated short (P0-1)", () => {
  const { buildIntents } = makeEngine({ wallet: "10000", risk: "1" });
  const bars = barsN(10);
  const out = buildIntents("AAA", [sellSig(9)], bars);
  assert.equal(out.length, 1, "a valid sell exit should be emitted");
  const it = out[0];
  assert.equal(it.side, "sell");
  assert.equal(it.reduceOnly, true, "sell must be reduceOnly");
  assert.equal(it.closeLong, true, "sell must close the existing long");
  assert.equal(it.action, "close_long");
  assert.equal(it.quantity, null, "sell must NOT fabricate a short share quantity");
  assert.match(it.rationale, /close the long|currently hold/i);
  assert.match(it.rationale, /never open a short/i);
});

test("buildIntents: buy stays a normal long entry with a real quantity (P0-1)", () => {
  const { buildIntents } = makeEngine({ wallet: "10000", risk: "1" });
  const bars = barsN(10);
  const out = buildIntents("AAA", [buySig(9)], bars);
  assert.equal(out.length, 1);
  const it = out[0];
  assert.equal(it.side, "buy");
  assert.ok(it.reduceOnly !== true, "buys are entries, not reduceOnly");
  assert.ok(isFinite(it.quantity) && it.quantity > 0, "buy must carry a real quantity");
  assert.equal(it.requiresHumanApproval, true);
});

/* --------------------------------------------------- P1-5 staleness guard */

test("buildIntents: only signals within the last 5 bars are emitted (P1-5)", () => {
  const { buildIntents } = makeEngine({ wallet: "10000", risk: "1" });
  const bars = barsN(20); // lastIdx = 19, window = idx >= 15
  const stale = buySig(10);            // 9 bars old -> dropped
  const fresh = buySig(17);            // 2 bars old -> kept
  const out = buildIntents("AAA", [stale, fresh], bars);
  assert.equal(out.length, 1, "only the fresh signal survives the staleness guard");
  assert.equal(out[0].signal.date, fresh.date);
  assert.equal(out[0].ageBars, 2, "ageBars = lastIdx - signal idx");
});

test("buildIntents: limitPrice uses the LATEST close; signalClose preserves the signal bar (P1-5)", () => {
  const { buildIntents } = makeEngine({ wallet: "10000", risk: "1" });
  const bars = barsN(10, 123.45); // latest close differs from the signal price (100)
  const out = buildIntents("AAA", [buySig(9)], bars);
  assert.equal(out.length, 1);
  assert.equal(out[0].limitPrice, 123.45, "limit must be the latest close (order placed now)");
  assert.equal(out[0].signalClose, 100, "signalClose preserves the signal bar's close");
});
