// Tests for the monthly-tracking and balances engine in budget.html.
//
// Sliced out of the page's <script> block the same way as budget.test.mjs, so
// these run against the exact source that ships.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBudget, sampleCSV, accountsCSV, monthlyRows } from "./_budget-engine.mjs";

const eng = loadBudget();
const plain = (v) => JSON.parse(JSON.stringify(v));
const {
  detectFileKind, parseAccounts, analyzeAccounts, buildSnapshot, mergeSnapshot,
  monthlyBreakdown, monthMovers, parseTransactions, analyze, money,
} = eng;

/* ------------------------------------------------------- file detection */

test("detectFileKind: tells a balances export from a transactions export", () => {
  const acc = accountsCSV([["TOTAL CHECKING", "Chase", "Bank Accounts", "Checking", "****5702", "$726.65", "Sep 3, 2026", ""]]);
  const txn = sampleCSV([["2026-08-14", "Bodega Wine Bar", "CARD ***1", "Restaurants/Dining", "Discretionary", "- $154.28", "No"]]);
  assert.equal(detectFileKind(acc), "accounts");
  assert.equal(detectFileKind(txn), "transactions");
  assert.equal(detectFileKind(""), "unknown");
  assert.equal(detectFileKind('"Foo","Bar"\n"1","2"\n'), "unknown");
});

/* ------------------------------------------------------------- accounts */

const SAMPLE_ACCOUNTS = accountsCSV([
  ["Roth Contributory IRA ...099", "Charles Schwab", "Investments", "Roth IRA", "****x099", "$30,997.31", "Sep 3, 2026", ""],
  ["TOTAL CHECKING", "Chase", "Bank Accounts", "Checking", "****5702", "$726.65", "Sep 3, 2026", ""],
  ["High Yield Savings Account", "American Express", "Bank Accounts", "Savings", "****1032", "$155.79", "Sep 3, 2026", ""],
  ["Discover it Card", "Discover", "Credit Cards", "Credit Card", "****6221", "$11,675.00", "Sep 2, 2026", "Needs Attention"],
  ["Citi Diamond Preferred Card", "Citibank", "Credit Cards", "Credit Card", "****7297", "$10,976.99", "Sep 3, 2026", ""],
  ["GUARANTEED RENEWABLE DI", "", "Other Insurance", "Disability Income", "****1995", "", "Sep 2, 2026", ""],
]);

test("parseAccounts: reads the export and keeps a row with no balance", () => {
  const { accounts, asOf } = parseAccounts(SAMPLE_ACCOUNTS);
  assert.equal(accounts.length, 6);
  assert.equal(asOf, "2026-09-03");
  const di = accounts.find((a) => a.name.startsWith("GUARANTEED"));
  assert.equal(di.hasBalance, false, "an empty balance is not silently counted as zero-with-value");
  assert.equal(di.balance, 0);
});

test("analyzeAccounts: net worth subtracts what you owe", () => {
  const a = analyzeAccounts(parseAccounts(SAMPLE_ACCOUNTS));
  assert.equal(Math.round(a.assets), 31880);      // 30997.31 + 726.65 + 155.79
  assert.equal(Math.round(a.liabilities), 22652); // 11675 + 10976.99
  assert.equal(Math.round(a.cash), 882);          // checking + savings only
  assert.equal(Math.round(a.cardDebt), 22652);
  assert.equal(Math.round(a.netWorth), Math.round(a.assets - a.liabilities));
  assert.ok(a.netWorth > 0);
});

test("analyzeAccounts: a card balance is a liability even though the export states it positive", () => {
  const a = analyzeAccounts(parseAccounts(SAMPLE_ACCOUNTS));
  const card = a.accounts.find((x) => x.name === "Discover it Card");
  assert.equal(card.isLiability, true);
  assert.equal(card.balance, 11675, "magnitude is preserved; the sign meaning lives in isLiability");
  assert.ok(!a.accounts.find((x) => x.name === "TOTAL CHECKING").isLiability);
});

test("analyzeAccounts: investments are not counted as spendable cash", () => {
  const a = analyzeAccounts(parseAccounts(SAMPLE_ACCOUNTS));
  assert.equal(Math.round(a.cash), 882, "a Roth IRA is an asset but not cash you can spend this month");
  assert.ok(a.assets > a.cash);
});

test("analyzeAccounts: institution flags are surfaced, not buried", () => {
  const a = analyzeAccounts(parseAccounts(SAMPLE_ACCOUNTS));
  assert.equal(a.attention.length, 1);
  assert.equal(a.attention[0].name, "Discover it Card");
});

test("parseAccounts: a file with no balance column is rejected", () => {
  assert.throws(() => parseAccounts('"Account Name / Nickname","Institution Name"\n"a","b"\n'),
    /Account Balance column/);
});

/* ------------------------------------------------------------ snapshots */

test("mergeSnapshot: same-date re-upload replaces rather than duplicates", () => {
  const a = { asOf: "2026-08-01", netWorth: 100, assets: 100, liabilities: 0, cash: 10, cardDebt: 0 };
  const b = { asOf: "2026-09-01", netWorth: 200, assets: 200, liabilities: 0, cash: 20, cardDebt: 0 };
  const bRevised = { ...b, netWorth: 250 };
  let hist = [];
  hist = mergeSnapshot(hist, a);
  hist = mergeSnapshot(hist, b);
  hist = mergeSnapshot(hist, bRevised);
  assert.equal(hist.length, 2, "re-uploading the same month must not double-count it");
  assert.equal(hist[1].netWorth, 250, "the newer read of that date wins");
});

test("mergeSnapshot: history stays in date order however it arrives", () => {
  let hist = [];
  for (const d of ["2026-09-01", "2026-07-01", "2026-08-01"]) {
    hist = mergeSnapshot(hist, { asOf: d, netWorth: 1, assets: 1, liabilities: 0, cash: 0, cardDebt: 0 });
  }
  assert.deepEqual(plain(hist.map((h) => h.asOf)), ["2026-07-01", "2026-08-01", "2026-09-01"]);
});

test("mergeSnapshot: a snapshot with no date is ignored, not stored undated", () => {
  assert.equal(mergeSnapshot([], { asOf: "", netWorth: 5 }).length, 0);
  assert.equal(mergeSnapshot([], null).length, 0);
});

test("buildSnapshot: carries the figures the history table needs", () => {
  const snap = buildSnapshot(analyzeAccounts(parseAccounts(SAMPLE_ACCOUNTS)));
  for (const k of ["asOf", "netWorth", "assets", "liabilities", "cash", "cardDebt"]) {
    assert.ok(k in snap, "snapshot is missing " + k);
  }
});

/* ------------------------------------------------- monthly tracking */

/** Six complete months where a named month spends `spike` instead of `base`. */
function sixMonths(base, spikeMonth, spike, category = "Restaurants/Dining") {
  const rows = [];
  for (let mo = 1; mo <= 6; mo++) {
    const M = String(mo).padStart(2, "0");
    const amount = `2026-${M}` === spikeMonth ? spike : base;
    rows.push([`2026-${M}-10`, "Dinner", "CARD ***1", category, "Discretionary", `- $${amount}.00`, "No"]);
  }
  // Pad the edges so all six months count as complete. Zero-value rows keep
  // the padding out of the totals being asserted on.
  rows.push(["2026-01-01", "Padding", "CARD ***1", "Groceries", "Discretionary", "- $0.00", "No"]);
  rows.push(["2026-06-30", "Padding", "CARD ***1", "Groceries", "Discretionary", "- $0.00", "No"]);
  return parseTransactions(sampleCSV(rows)).txns;
}

test("monthlyBreakdown: one row per complete month, in order", () => {
  const m = analyze(sixMonths(100, null, 100));
  const b = monthlyBreakdown(m);
  assert.equal(b.length, 6);
  assert.deepEqual(plain(b.map((r) => r.month)),
    ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
});

test("monthlyBreakdown: the running baseline excludes the month being judged", () => {
  // 100/mo throughout except May, which is 500.
  const m = analyze(sixMonths(100, "2026-05", 500));
  const b = monthlyBreakdown(m);
  const may = b.find((r) => r.month === "2026-05");
  assert.equal(may.total, 500);
  assert.equal(may.baseline, 100, "a spike month must not be averaged into its own baseline");
  assert.equal(may.baselineDelta, 400);
});

test("monthlyBreakdown: the first month has no comparison rather than a fake one", () => {
  const b = monthlyBreakdown(analyze(sixMonths(100, null, 100)));
  assert.equal(b[0].prevDelta, null);
  assert.equal(b[0].baseline, null);
  assert.equal(b[0].baselineDelta, null);
  assert.equal(b[1].prevDelta, 0, "the second month can compare to the first");
});

test("monthlyBreakdown: prior-month delta tracks the actual previous month", () => {
  const b = monthlyBreakdown(analyze(sixMonths(100, "2026-04", 300)));
  assert.equal(b.find((r) => r.month === "2026-04").prevDelta, 200);
  assert.equal(b.find((r) => r.month === "2026-05").prevDelta, -200);
});

test("monthlyBreakdown: names the largest category of each month", () => {
  const b = monthlyBreakdown(analyze(sixMonths(100, null, 100)));
  assert.equal(b[2].topCategory, "Restaurants/Dining");
  assert.equal(b[2].topCategoryTotal, 100);
});

test("monthMovers: attributes a spike to the category that caused it", () => {
  const m = analyze(sixMonths(100, "2026-06", 900));
  const movers = monthMovers(monthlyBreakdown(m), "2026-06");
  assert.ok(movers.length >= 1);
  assert.equal(movers[0].category, "Restaurants/Dining");
  assert.equal(movers[0].now, 900);
  assert.equal(movers[0].baseline, 100);
  assert.equal(movers[0].delta, 800);
});

test("monthMovers: a category that fell shows as a negative mover", () => {
  const m = analyze(sixMonths(500, "2026-06", 100));
  const movers = monthMovers(monthlyBreakdown(m), "2026-06");
  const dining = movers.find((v) => v.category === "Restaurants/Dining");
  assert.ok(dining.delta < 0, "a drop is information too, not something to hide");
});

test("monthMovers: noise under $25 is not reported as a move", () => {
  const m = analyze(sixMonths(100, "2026-06", 110));
  assert.equal(monthMovers(monthlyBreakdown(m), "2026-06").length, 0);
});

test("monthMovers: the first month has nothing to compare against", () => {
  const b = monthlyBreakdown(analyze(sixMonths(100, null, 100)));
  assert.deepEqual(plain(monthMovers(b, b[0].month)), []);
  assert.deepEqual(plain(monthMovers(b, "not-a-month")), []);
});

/* ------------------------------------------------- balances in the model */

test("analyze: balances make the debt recommendation cite the real number", () => {
  const txns = sixMonths(100, null, 100);
  const accounts = analyzeAccounts(parseAccounts(SAMPLE_ACCOUNTS));
  const withBal = analyze(txns, { accounts });
  const withoutBal = analyze(txns);

  const rec = withBal.recommendations.find((r) => r.id === "debt");
  assert.ok(rec, "a real card balance must surface even when no interest was charged in the window");
  assert.ok(rec.title.includes(money(accounts.cardDebt)));
  assert.ok(rec.annual > 0);
  assert.ok(rec.evidence.some((e) => e.includes(money(accounts.cardDebt))));

  assert.ok(!withoutBal.recommendations.find((r) => r.id === "debt"),
    "with no balances and no interest charges there is nothing to claim");
});

test("analyze: debt cost is sized off the balance at the assumed APR", () => {
  const accounts = analyzeAccounts(parseAccounts(SAMPLE_ACCOUNTS));
  const m = analyze(sixMonths(100, null, 100), { accounts, cardApr: 0.2 });
  const rec = m.recommendations.find((r) => r.id === "debt");
  assert.equal(Math.round(rec.annual), Math.round(accounts.cardDebt * 0.2));
});

test("analyze: the model exposes the latest month and its movers", () => {
  const m = analyze(sixMonths(100, "2026-06", 900));
  assert.equal(m.latestMonth, "2026-06");
  assert.equal(m.monthly.length, 6);
  assert.ok(m.movers.length >= 1);
  assert.equal(m.movers[0].category, "Restaurants/Dining");
});

test("analyze: works with no balances at all", () => {
  const m = analyze(sixMonths(100, null, 100));
  assert.equal(m.accounts, null);
  assert.ok(m.monthly.length > 0, "monthly tracking must not depend on a balances file");
});
