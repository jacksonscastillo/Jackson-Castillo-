// Tests for the analysis engine inside budget.html.
//
// The functions are sliced out of the page's <script> block (see
// tests/_budget-engine.mjs), so these assertions run against the exact source
// the browser executes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBudget, sampleCSV, monthlyRows } from "./_budget-engine.mjs";

const eng = loadBudget();

// Arrays and objects built inside the vm sandbox carry that realm's
// prototypes, which assert.deepEqual rejects as "not reference-equal". Round
// tripping through JSON compares the values, which is what these tests mean.
const plain = (v) => JSON.parse(JSON.stringify(v));

const {
  parseAmount, parseCSV, mapColumns, parseDate, normalizeMerchant, classifyTxn,
  parseTransactions, fullMonths, monthSpan, groupSpend, monthlySeries, cadenceOf,
  detectRecurring, auditFees, detectSpikes, analyze, futureValue, median, money,
} = eng;

/* ------------------------------------------------------------- amounts */

test("parseAmount: the export's '- $1,234.56' outflow form", () => {
  assert.equal(parseAmount("- $1,234.56"), -1234.56);
  assert.equal(parseAmount("-$1,234.56"), -1234.56);
  assert.equal(parseAmount("$6,074.01"), 6074.01);
  assert.equal(parseAmount("$0.61"), 0.61);
});

test("parseAmount: accounting parentheses and bare numbers", () => {
  assert.equal(parseAmount("($5.00)"), -5);
  assert.equal(parseAmount("(1,000)"), -1000);
  assert.equal(parseAmount("-42.5"), -42.5);
  assert.equal(parseAmount("42.5"), 42.5);
  assert.equal(parseAmount("+7"), 7);
});

test("parseAmount: junk is NaN, not zero — a bad row must be skipped, not counted", () => {
  assert.ok(Number.isNaN(parseAmount("")));
  assert.ok(Number.isNaN(parseAmount("n/a")));
  assert.ok(Number.isNaN(parseAmount("--5")));
  assert.ok(Number.isNaN(parseAmount("$")));
});

/* ----------------------------------------------------------------- csv */

test("parseCSV: quoted commas, escaped quotes, CRLF, BOM", () => {
  const rows = parseCSV('﻿"a","b"\r\n"x, y","he said ""hi"""\r\n');
  assert.deepEqual(plain(rows), [["a", "b"], ["x, y", 'he said "hi"']]);
});

test("parseCSV: unquoted fields and a final line with no newline", () => {
  assert.deepEqual(plain(parseCSV("a,b\n1,2")), [["a", "b"], ["1", "2"]]);
});

test("parseCSV: blank lines are dropped", () => {
  assert.deepEqual(plain(parseCSV("a,b\n\n1,2\n\n")), [["a", "b"], ["1", "2"]]);
});

test("mapColumns: matches this export's headers and tolerates other exports", () => {
  const m = mapColumns(["Date", "Description", "Associated Account", "Category", "Type", "Amount (USD)", "Split Transaction"]);
  assert.deepEqual(plain(m), { date: 0, desc: 1, account: 2, category: 3, type: 4, amount: 5 });

  const alt = mapColumns(["Transaction Date", "Merchant", "Amount"]);
  assert.equal(alt.date, 0);
  assert.equal(alt.desc, 1);
  assert.equal(alt.amount, 2);
  assert.equal(alt.type, -1, "a missing Type column reports -1 rather than guessing");
});

test("parseDate: ISO and US forms; garbage is null", () => {
  assert.equal(parseDate("2026-08-14").iso, "2026-08-14");
  assert.equal(parseDate("8/4/2026").iso, "2026-08-04");
  assert.equal(parseDate("12/31/99").iso, "1999-12-31");
  assert.equal(parseDate("not a date"), null);
  assert.equal(parseDate("2026-13-01"), null);
});

/* ----------------------------------------------------------- merchants */

test("normalizeMerchant: strips processor prefixes and city/state tails", () => {
  assert.equal(normalizeMerchant("TST* Dialog Cafe Los Angeles CA"), "Dialog Cafe");
  assert.equal(normalizeMerchant("SQ *BLUE BOTTLE #1234"), "Blue Bottle");
  assert.equal(normalizeMerchant("UBER   EATS"), "Uber Eats");
});

test("normalizeMerchant: masked and long digit runs collapse to one merchant", () => {
  assert.equal(
    normalizeMerchant("NINA HUONG NGUYEN XX9541"),
    normalizeMerchant("NINA HUONG NGUYEN XX7777"),
    "different masked account suffixes must group together"
  );
  assert.equal(normalizeMerchant("BARON FINANCIAL ACH ID: XX9541"), "Baron Financial Ach");
});

test("normalizeMerchant: never eats the whole name", () => {
  // "New York" is a city fragment, but it is the merchant here.
  assert.equal(normalizeMerchant("NEW YORK BAGEL"), "New York Bagel");
  assert.equal(normalizeMerchant(""), "Unknown");
  assert.equal(normalizeMerchant("###"), "Unknown");
});

/* --------------------------------------------------------- classifying */

test("classifyTxn: transfers, trades and card payments are internal, not spending", () => {
  const internal = [
    { type: "Transfer", category: "Transfers", desc: "Transfer to JPMorganChase", amount: -6500 },
    { type: "Transfer", category: "Securities Trades", desc: "PUT ISHR BITCOIN TR ETF", amount: -455 },
    { type: "Transfer", category: "Credit Card Payments", desc: "Payment Thank You", amount: -2000 },
  ];
  for (const t of internal) assert.equal(classifyTxn(t), "internal", t.desc);
});

test("classifyTxn: Discretionary and Fixed are spending; Income is income", () => {
  assert.equal(classifyTxn({ type: "Discretionary", category: "Restaurants/Dining", desc: "Chipotle", amount: -14.27 }), "spend");
  assert.equal(classifyTxn({ type: "Fixed", category: "Insurance", desc: "NM Premium", amount: -234.95 }), "spend");
  assert.equal(classifyTxn({ type: "Income", category: "Paychecks/Salary", desc: "ACH", amount: 3940 }), "income");
});

test("classifyTxn: with no Type column it falls back to the sign", () => {
  assert.equal(classifyTxn({ type: "", category: "Groceries", desc: "Erewhon", amount: -50 }), "spend");
  assert.equal(classifyTxn({ type: "", category: "Other", desc: "Refund", amount: 50 }), "income");
});

/* -------------------------------------------------------------- window */

test("fullMonths: partial first and last months are excluded from rate math", () => {
  const t = (date, day) => ({ date, mo: date.slice(0, 7), day });
  // Data starts 2025-05-07 and ends 2026-08-14 — both edges partial.
  const txns = [t("2025-05-07", 7), t("2025-06-15", 15), t("2026-08-14", 14)];
  const full = fullMonths(txns);
  assert.equal(full[0], "2025-06");
  assert.equal(full[full.length - 1], "2026-07");
  assert.equal(monthSpan(txns).length, full.length + 2);
});

test("fullMonths: a clean month boundary keeps both edges", () => {
  const t = (date, day) => ({ date, mo: date.slice(0, 7), day });
  const txns = [t("2026-01-01", 1), t("2026-02-14", 14), t("2026-03-31", 31)];
  assert.deepEqual(plain(fullMonths(txns)), ["2026-01", "2026-02", "2026-03"]);
});

test("fullMonths: two months or fewer are never trimmed away to nothing", () => {
  const t = (date, day) => ({ date, mo: date.slice(0, 7), day });
  assert.ok(fullMonths([t("2026-05-09", 9), t("2026-06-12", 12)]).length > 0);
});

test("monthSpan: covers gaps where a month has no transactions", () => {
  const t = (date) => ({ date, mo: date.slice(0, 7) });
  assert.deepEqual(plain(monthSpan([t("2025-11-02"), t("2026-02-02")])),
    ["2025-11", "2025-12", "2026-01", "2026-02"]);
});

/* ------------------------------------------------------------ grouping */

test("groupSpend: refunds net against spending in the same group", () => {
  const txns = [
    { category: "Clothing", amount: -300, bucket: "spend" },
    { category: "Clothing", amount: 100, bucket: "spend" },
  ];
  const g = groupSpend(txns, (t) => t.category, 2);
  assert.equal(g[0].total, 200);
  assert.equal(g[0].perMonth, 100);
  assert.equal(g[0].n, 2);
});

test("monthlySeries: aligns to the given months and ignores anything outside", () => {
  const txns = [
    { mo: "2026-01", amount: -100 },
    { mo: "2026-01", amount: -50 },
    { mo: "2026-03", amount: -25 },
    { mo: "2025-12", amount: -999 },
  ];
  assert.deepEqual(plain(monthlySeries(txns, ["2026-01", "2026-02", "2026-03"])), [150, 0, 25]);
});

/* ----------------------------------------------------------- recurring */

test("cadenceOf: gap in days maps to a cadence label", () => {
  assert.equal(cadenceOf(7).label, "weekly");
  assert.equal(cadenceOf(14).label, "biweekly");
  assert.equal(cadenceOf(30).label, "monthly");
  assert.equal(cadenceOf(91).label, "quarterly");
  assert.equal(cadenceOf(365).label, "annual");
  assert.equal(cadenceOf(700).label, "irregular");
  assert.equal(cadenceOf(7).regular, false, "weekly gaps are too noisy to call a contract");
});

test("detectRecurring: a fixed monthly charge is a subscription", () => {
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  const spend = months.map((mo, i) => ({
    merchant: "Linkedin", category: "Dues and Subscriptions", mo,
    date: `${mo}-14`, time: Date.UTC(2026, i, 14), amount: -119.99,
  }));
  const [r] = detectRecurring(spend, months, Date.UTC(2026, 5, 20));
  assert.equal(r.kind, "subscription");
  assert.equal(r.cadence, "monthly");
  assert.equal(r.median, 119.99);
  assert.ok(Math.abs(r.perMonth - 119.99) < 0.01);
  assert.equal(r.stale, false);
});

test("detectRecurring: a frequent but variable merchant is a habit, not a contract", () => {
  const months = ["2026-01", "2026-02", "2026-03", "2026-04"];
  const amounts = [12, 48, 9, 130, 22, 61, 15, 95];
  const spend = amounts.map((a, i) => ({
    merchant: "Uber Eats", category: "Restaurants/Dining",
    mo: months[i % 4], date: `${months[i % 4]}-0${(i % 4) + 1}`,
    time: Date.UTC(2026, i % 4, (i % 4) + 1), amount: -a,
  }));
  const [r] = detectRecurring(spend, months, Date.UTC(2026, 3, 28));
  assert.equal(r.kind, "habit", "variable amounts must not be sold as a cancellable subscription");
});

test("detectRecurring: a monthly charge that stopped is flagged stale", () => {
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  const spend = [0, 1, 2, 3].map((i) => ({
    merchant: "Old Gym", category: "Personal Care", mo: months[i],
    date: `${months[i]}-05`, time: Date.UTC(2026, i, 5), amount: -60,
  }));
  const [r] = detectRecurring(spend, months, Date.UTC(2026, 5, 30));
  assert.equal(r.stale, true, "no charge in ~2 months means confirm it was actually cancelled");
});

test("detectRecurring: fewer than three months is never called recurring", () => {
  const spend = [0, 1].map((i) => ({
    merchant: "Twice Only", category: "X", mo: `2026-0${i + 1}`,
    date: `2026-0${i + 1}-05`, time: Date.UTC(2026, i, 5), amount: -30,
  }));
  assert.equal(detectRecurring(spend, ["2026-01", "2026-02"], Date.UTC(2026, 1, 28)).length, 0);
});

/* ---------------------------------------------------------------- fees */

test("auditFees: buckets fees by kind and sums them", () => {
  const spend = [
    { desc: "Renewal Membership Fee", category: "Dues and Subscriptions", amount: -895, date: "2026-05-25", account: "Platinum" },
    { desc: "Interest Charge", category: "Other", amount: -82.22, date: "2026-07-03", account: "Card" },
    { desc: "Bal Trans Fee", category: "Other", amount: -84, date: "2026-07-12", account: "Discover" },
    { desc: "Non Chase ATM Fee With", category: "ATM/Cash Withdrawals", amount: -3, date: "2026-04-01", account: "Checking" },
  ];
  const f = auditFees(spend, 12);
  assert.ok(Math.abs(f.total - 1064.22) < 0.01);
  const kinds = f.byKind.map((k) => k.kind);
  assert.ok(kinds.includes("Card annual fee"));
  assert.ok(kinds.includes("Interest"));
  assert.ok(kinds.includes("Balance transfer fee"));
  assert.ok(kinds.includes("ATM fee"));
});

test("auditFees: 'COFFEE' is not a fee — patterns are word-anchored", () => {
  const spend = [
    { desc: "THE COFFEE BEAN & TEA LEAF", category: "Restaurants/Dining", amount: -7.55, date: "2026-01-01", account: "a" },
    { desc: "Joshua Tree Coffee Co", category: "Restaurants/Dining", amount: -6.8, date: "2026-01-02", account: "a" },
    { desc: "Toffee Shop", category: "Restaurants/Dining", amount: -9, date: "2026-01-03", account: "a" },
  ];
  assert.equal(auditFees(spend, 3).total, 0);
});

test("auditFees: a fee refund does not count as a fee paid", () => {
  const spend = [
    { desc: "Annual Fee", category: "X", amount: -95, date: "2026-01-01", account: "a" },
    { desc: "Annual Fee Reversal", category: "X", amount: 95, date: "2026-01-05", account: "a" },
  ];
  assert.equal(auditFees(spend, 1).total, 95, "only the charge is counted; the credit is not a second fee");
});

/* -------------------------------------------------------------- spikes */

test("detectSpikes: flags a category whose recent run-rate jumped", () => {
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  const spend = [];
  months.forEach((mo, i) => {
    spend.push({ mo, category: "Travel", amount: i >= 3 ? -900 : -200 });
    spend.push({ mo, category: "Groceries", amount: -300 });
  });
  const s = detectSpikes(spend, months, 3);
  assert.equal(s.length, 1);
  assert.equal(s[0].category, "Travel");
  assert.equal(s[0].recentPM, 900);
  assert.equal(s[0].basePM, 200);
  assert.equal(s[0].delta, 700);
});

test("detectSpikes: noise below the dollar and percent floors is ignored", () => {
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];
  const spend = months.map((mo, i) => ({ mo, category: "Groceries", amount: i >= 3 ? -320 : -300 }));
  assert.equal(detectSpikes(spend, months, 3).length, 0);
});

/* ------------------------------------------------------- end to end */

test("parseTransactions: reads the export shape and skips unreadable rows", () => {
  const csv = sampleCSV([
    ["2026-08-14", "Bodega Wine Bar", "J. CASTILLO ***2556", "Restaurants/Dining", "Discretionary", "- $154.28", "No"],
    ["2026-08-14", "Transfer to JPMorganChase", "HYSA ***1032", "Transfers", "Transfer", "- $6,500.00", "No"],
    ["2026-08-14", "Baron Financial Ach", "HYSA ***1032", "Other Income", "Income", "$6,074.01", "No"],
    ["", "Broken row", "", "", "", "", "No"],
  ]);
  const { txns, skipped } = parseTransactions(csv);
  assert.equal(txns.length, 3);
  assert.equal(skipped, 1);
  assert.equal(txns.find((t) => t.desc === "Bodega Wine Bar").bucket, "spend");
  assert.equal(txns.find((t) => t.desc.startsWith("Transfer")).bucket, "internal");
  assert.equal(txns.find((t) => t.desc === "Baron Financial Ach").bucket, "income");
});

test("parseTransactions: a file without Date/Description/Amount is rejected with a usable message", () => {
  assert.throws(() => parseTransactions('"Foo","Bar"\n"1","2"\n'), /Could not find Date, Description and Amount/);
  assert.throws(() => parseTransactions('"Date","Description","Amount"\n'), /no data rows/);
});

test("analyze: transfers never inflate spending", () => {
  const rows = [
    ...monthlyRows("2026-01", 6, { desc: "Rent", category: "Housing", type: "Fixed", amount: "- $2,000.00", day: 1 }),
    ...monthlyRows("2026-01", 6, { desc: "Transfer to Savings", category: "Transfers", type: "Transfer", amount: "- $5,000.00", day: 2 }),
    ...monthlyRows("2026-01", 6, { desc: "Paycheck", category: "Paychecks/Salary", type: "Income", amount: "$6,000.00", day: 3 }),
  ];
  // Pad the edges so all six months count as complete.
  rows.push(["2026-01-01", "Coffee", "CARD ***1111", "Restaurants/Dining", "Discretionary", "- $5.00", "No"]);
  rows.push(["2026-06-30", "Coffee", "CARD ***1111", "Restaurants/Dining", "Discretionary", "- $5.00", "No"]);

  const { txns } = parseTransactions(sampleCSV(rows));
  const m = analyze(txns);
  assert.equal(m.monthCount, 6);
  assert.equal(m.totalSpend, 6 * 2000 + 10, "only rent and the two coffees are spending");
  assert.equal(m.perMonth, (6 * 2000 + 10) / 6);
  assert.equal(m.totalIncome, 36000);
  assert.equal(m.incomeComplete, true);
});

test("analyze: an export missing its paycheck feed is flagged, not silently averaged", () => {
  const rows = [
    ...monthlyRows("2026-01", 6, { desc: "Rent", category: "Housing", type: "Fixed", amount: "- $2,000.00", day: 1 }),
  ];
  rows.push(["2026-01-01", "Coffee", "CARD ***1111", "Restaurants/Dining", "Discretionary", "- $5.00", "No"]);
  rows.push(["2026-06-30", "Coffee", "CARD ***1111", "Restaurants/Dining", "Discretionary", "- $5.00", "No"]);
  const { txns } = parseTransactions(sampleCSV(rows));
  assert.equal(analyze(txns).incomeComplete, false);
});

test("analyze: recommendations are quantified, ranked, and traceable to the file", () => {
  const rows = [];
  // A dominant dining category built from delivery orders.
  for (let mo = 1; mo <= 6; mo++) {
    const M = String(mo).padStart(2, "0");
    for (let d = 1; d <= 10; d++) {
      rows.push([`2026-${M}-${String(d).padStart(2, "0")}`, "UBER EATS", "CARD ***1111",
        "Restaurants/Dining", "Discretionary", "- $40.00", "No"]);
    }
    rows.push([`2026-${M}-20`, "Interest Charge", "CARD ***1111", "Other", "Discretionary", "- $50.00", "No"]);
  }
  rows.push(["2026-01-01", "Rent", "CARD ***1111", "Housing", "Fixed", "- $100.00", "No"]);
  rows.push(["2026-06-30", "Rent", "CARD ***1111", "Housing", "Fixed", "- $100.00", "No"]);

  const { txns } = parseTransactions(sampleCSV(rows));
  const m = analyze(txns);
  const ids = m.recommendations.map((r) => r.id);

  assert.ok(ids.includes("fees"), "interest charges surface as a fee recommendation");
  assert.ok(ids.includes("delivery"), "delivery-app spend surfaces its markup");
  assert.ok(ids.includes("debt"), "interest implies a revolving balance");
  for (const r of m.recommendations) {
    assert.ok(r.annual > 0, r.id + " must carry a dollar figure");
    assert.ok(r.evidence.length > 0, r.id + " must cite evidence");
    assert.ok(r.defaultAdopt >= 0 && r.defaultAdopt <= 1, r.id + " adoption is a fraction");
  }
  const annuals = m.recommendations.map((r) => r.annual);
  assert.deepEqual(plain(annuals), plain(annuals).sort((a, b) => b - a), "ranked by size");
});

test("analyze: no recommendation ever claims more than the category it comes from", () => {
  const rows = [];
  for (let mo = 1; mo <= 6; mo++) {
    const M = String(mo).padStart(2, "0");
    for (let d = 1; d <= 10; d++) {
      rows.push([`2026-${M}-${String(d).padStart(2, "0")}`, "DOORDASH", "CARD ***1111",
        "Restaurants/Dining", "Discretionary", "- $30.00", "No"]);
    }
  }
  const { txns } = parseTransactions(sampleCSV(rows));
  const m = analyze(txns);
  const dining = m.byCategory.find((c) => c.key === "Restaurants/Dining");
  for (const r of m.recommendations) {
    if (r.id === "delivery" || r.id === "topcat") {
      assert.ok(r.annual <= dining.perMonth * 12 + 0.01,
        r.id + " claims " + money(r.annual) + " against a category worth " + money(dining.perMonth * 12) + "/yr");
    }
  }
});

/* ------------------------------------------- recommendation guardrails */

/** Six months of a repeating charge, ten per month at `amount` each. */
function heavyCategory(desc, category, amount, perMonth = 10) {
  const rows = [];
  for (let mo = 1; mo <= 6; mo++) {
    const M = String(mo).padStart(2, "0");
    for (let d = 1; d <= perMonth; d++) {
      rows.push([`2026-${M}-${String(d).padStart(2, "0")}`, desc, "CARD ***1111",
        category, "Discretionary", `- $${amount}.00`, "No"]);
    }
  }
  return rows;
}

test("recommendations: gas stations are never sold as overlapping memberships", () => {
  const rows = [
    ...heavyCategory("EXXONMOBIL", "Gasoline/Fuel", 60),
    ...heavyCategory("CHEVRON", "Gasoline/Fuel", 55),
  ];
  const { txns } = parseTransactions(sampleCSV(rows));
  const ids = analyze(txns).recommendations.map((r) => r.id);
  assert.ok(!ids.includes("dupe-Gasoline/Fuel"),
    "two gas stations is driving, not a duplicate subscription");
});

test("recommendations: restaurants are never sold as overlapping memberships", () => {
  const rows = [
    ...heavyCategory("UBER EATS", "Restaurants/Dining", 40),
    ...heavyCategory("BODEGA WINE BAR", "Restaurants/Dining", 45),
  ];
  const { txns } = parseTransactions(sampleCSV(rows));
  const ids = analyze(txns).recommendations.map((r) => r.id);
  assert.ok(!ids.includes("dupe-Restaurants/Dining"));
});

test("recommendations: two gyms in the same month ARE flagged as overlapping", () => {
  const rows = [
    ...monthlyRows("2026-01", 6, { desc: "EQUINOX FITNESS", category: "Personal Care", type: "Discretionary", amount: "- $322.00", day: 3 }),
    ...monthlyRows("2026-01", 6, { desc: "HOT 8 YOGA", category: "Personal Care", type: "Discretionary", amount: "- $249.00", day: 9 }),
  ];
  const { txns } = parseTransactions(sampleCSV(rows));
  const rec = analyze(txns).recommendations.find((r) => r.id === "dupe-Personal Care");
  assert.ok(rec, "a membership-shaped category with two steady providers should surface");
  assert.ok(rec.annual > 0);
});

test("recommendations: insurance and medical are never turned into a cut", () => {
  const rows = [];
  for (let mo = 1; mo <= 6; mo++) {
    const M = String(mo).padStart(2, "0");
    // Premiums triple in the back half — a genuine spike, but not advice to cut.
    rows.push([`2026-${M}-05`, "NORTHWESTERN MUTUAL", "CHK ***1", "Insurance", "Fixed",
      mo > 3 ? "- $1,200.00" : "- $300.00", "No"]);
    rows.push([`2026-${M}-06`, "SPECIALIST VISIT", "CHK ***1", "Healthcare/Medical", "Fixed",
      mo > 3 ? "- $900.00" : "- $200.00", "No"]);
  }
  const m = analyze(parseTransactions(sampleCSV(rows)).txns);
  assert.ok(m.spikes.some((s) => s.category === "Insurance"),
    "the spike is still reported as information");
  for (const r of m.recommendations) {
    assert.ok(!/insurance|healthcare/i.test(r.id + r.title),
      "protected categories must not become a savings recommendation: " + r.title);
  }
});

test("recommendations: overlapping claims on one category are capped, not summed", () => {
  // Dining is huge and built entirely from delivery — the category rule, the
  // delivery rule and the spike rule all point at the same dollars.
  const rows = [];
  for (let mo = 1; mo <= 8; mo++) {
    const M = String(mo).padStart(2, "0");
    const n = mo > 5 ? 20 : 10;
    for (let d = 1; d <= n; d++) {
      rows.push([`2026-${M}-${String(d).padStart(2, "0")}`, "UBER EATS", "CARD ***1111",
        "Restaurants/Dining", "Discretionary", "- $50.00", "No"]);
    }
  }
  const m = analyze(parseTransactions(sampleCSV(rows)).txns);
  const dining = m.byCategory.find((c) => c.key === "Restaurants/Dining");
  const claimed = m.recommendations
    .filter((r) => r.scope === "Restaurants/Dining")
    .reduce((s, r) => s + r.annual, 0);
  assert.ok(m.recommendations.filter((r) => r.scope === "Restaurants/Dining").length >= 2,
    "several rules should be pointing at this category");
  assert.ok(claimed <= dining.perMonth * 12 * m.opts.categoryShare + 0.01,
    "claims on one category total " + money(claimed) + ", above the " +
    Math.round(m.opts.categoryShare * 100) + "% share of " + money(dining.perMonth * 12));
});

test("recommendations: the headline total never exceeds total spending", () => {
  const rows = [];
  for (let mo = 1; mo <= 8; mo++) {
    const M = String(mo).padStart(2, "0");
    for (let d = 1; d <= 12; d++) {
      rows.push([`2026-${M}-${String(d).padStart(2, "0")}`, d % 2 ? "UBER EATS" : "DOORDASH",
        "CARD ***1111", "Restaurants/Dining", "Discretionary", "- $45.00", "No"]);
    }
    rows.push([`2026-${M}-21`, "Interest Charge", "CARD ***1111", "Other", "Discretionary", "- $90.00", "No"]);
    rows.push([`2026-${M}-22`, "EQUINOX FITNESS", "CARD ***1111", "Personal Care", "Discretionary", "- $322.00", "No"]);
    rows.push([`2026-${M}-23`, "HOT 8 YOGA", "CARD ***1111", "Personal Care", "Discretionary", "- $249.00", "No"]);
  }
  const m = analyze(parseTransactions(sampleCSV(rows)).txns);
  const total = m.recommendations.reduce((s, r) => s + r.annual, 0);
  assert.ok(total <= m.perMonth * 12,
    "identified savings " + money(total) + " must not exceed annual spending " + money(m.perMonth * 12));
});

/* ----------------------------------------------------------- utilities */

test("futureValue: monthly contributions compound", () => {
  assert.equal(Math.round(futureValue(100, 10, 0)), 12000);
  assert.equal(Math.round(futureValue(1000, 10, 0.08)), 182946);
  assert.equal(futureValue(0, 30, 0.08), 0);
});

test("median: odd and even lengths, order independent", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), 0);
});

test("money: sign and separators", () => {
  assert.equal(money(1234.56), "$1,235");
  assert.equal(money(1234.56, true), "$1,234.56");
  assert.equal(money(-99), "-$99");
});
