// Shared test helper for budget.html — same approach as _engine.mjs: read the
// page as a string, slice the named pure functions out of its <script> block,
// and eval them in a sandbox. budget.html is never modified, so the tests
// exercise the exact source that ships in the page.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import { sliceFunction, sliceConst } from "./_engine.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(__dirname, "..", "budget.html");

/** Read the inline <script> block from budget.html. */
export function readScriptBlock() {
  const html = readFileSync(HTML_PATH, "utf8");
  const m = html.match(/<script>\n"use strict";([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Could not find the engine <script> block in budget.html");
  return m[1];
}

// Consts every sliced function may reach for. Missing ones are skipped.
const CONSTS = ["CITY_RX", "INTERNAL_CATS", "INTERNAL_DESC", "FEE_PATTERNS", "DELIVERY_RX",
  "PROTECTED_CATS", "MEMBERSHIP_CATS", "LIABILITY_CATS", "CASH_CATS", "MONTH_NAMES", "CH"];

// Helpers pulled in unconditionally so callers only name what they test.
const HELPERS = [
  "money", "parseAmount", "parseCSV", "headerKey", "mapColumns", "parseDate",
  "normalizeMerchant", "classifyTxn", "parseTransactions", "median", "daysInMonth",
  "monthSpan", "fullMonths", "netSpend", "groupSpend", "monthlySeries", "cadenceOf",
  "detectRecurring", "modeOf", "auditFees", "detectSpikes", "analyze",
  "capOverlap", "buildRecommendations", "futureValue", "esc", "niceMax",
  "detectFileKind", "parseAccounts", "analyzeAccounts", "buildSnapshot", "mergeSnapshot",
  "monthlyBreakdown", "monthMovers",
];

/**
 * Slice the engine into a fresh sandbox and return it. `names` is optional —
 * every helper above is always available.
 */
export function loadBudget(names = [], extraGlobals = {}) {
  const src = readScriptBlock();
  const consts = CONSTS.map((n) => { try { return sliceConst(src, n); } catch { return ""; } }).filter(Boolean);
  const wanted = [...new Set([...HELPERS, ...names])];
  const fns = wanted.map((n) => sliceFunction(src, n));
  const sandbox = { ...extraGlobals };
  vm.createContext(sandbox);
  const exposer =
    consts.join("\n") + "\n" + fns.join("\n\n") + "\n\n;(()=>{" +
    wanted.map((n) => `globalThis.${n}=${n};`).join("") + "})();";
  vm.runInContext(exposer, sandbox, { filename: "budget-engine.sliced.js" });
  return sandbox;
}

/** A small CSV in the shape the page is built for. */
export function sampleCSV(rows) {
  const head = '"Date","Description","Associated Account","Category","Type","Amount (USD)","Split Transaction"';
  const body = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  return "﻿" + head + "\n" + body + "\n";
}

/** Build `n` months of identical rows starting at `startMo` (YYYY-MM). */
export function monthlyRows(startMo, n, { day = 15, desc, account = "CARD ***1111", category, type, amount }) {
  const out = [];
  let y = +startMo.slice(0, 4), m = +startMo.slice(5, 7);
  for (let i = 0; i < n; i++) {
    const d = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    out.push([d, desc, account, category, type, amount, "No"]);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}

/** A balances export in the shape the page is built for. */
export function accountsCSV(rows) {
  const head = '"Account Name / Nickname","Institution Name","Account Category","Account Type","Account Number","Account Balance","Last Updated","Notes"';
  const body = rows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\n");
  return "\ufeff" + head + "\n" + body + "\n";
}
