// Shared test helper: reads demark-trading.html, extracts its <script> block,
// slices out the pure engine functions by name, and evals them into a sandbox.
//
// We never modify demark-trading.html — we read it as a string and surgically
// slice function source ranges using a brace-matched scanner. This keeps the
// tests honest: they exercise the *exact* source shipped in the page.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(__dirname, "..", "demark-trading.html");

/** Read the inline <script> block from the HTML file. */
export function readScriptBlock() {
  const html = readFileSync(HTML_PATH, "utf8");
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("Could not find <script> block in demark-trading.html");
  return m[1];
}

/**
 * Slice a top-level `function NAME(...) { ... }` declaration out of source by
 * scanning for the opening brace then brace-matching to its close. The scanner
 * skips strings, template literals, and comments so that braces/quotes inside
 * them (e.g. an apostrophe in a `// isn't` comment) don't unbalance the count.
 */
export function sliceFunction(src, name) {
  const re = new RegExp("function\\s+" + name + "\\s*\\(", "g");
  const m = re.exec(src);
  if (!m) throw new Error("Function not found: " + name);
  // find the opening brace of the body
  let i = re.lastIndex;
  while (i < src.length && src[i] !== "{") i++;
  if (src[i] !== "{") throw new Error("No body brace for: " + name);
  let depth = 0;
  const start = m.index;
  let lastSig = ""; // last significant (non-ws) char, to disambiguate regex vs divide
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    const next = src[j + 1];
    // skip line comments
    if (ch === "/" && next === "/") {
      while (j < src.length && src[j] !== "\n") j++;
      continue;
    }
    // skip block comments
    if (ch === "/" && next === "*") {
      j += 2;
      while (j < src.length && !(src[j] === "*" && src[j + 1] === "/")) j++;
      j++; // land on the closing '/'
      continue;
    }
    // skip regex literals. A `/` starts a regex when the previous significant
    // char is an operator/opening bracket/comma/etc. (i.e. a value can't
    // precede it), which is the standard heuristic. The engine uses regex only
    // after `(`, `=`, `.replace(`, `.split(`, so this is unambiguous here.
    if (ch === "/" && (lastSig === "" || "(,=:[!&|?{;".includes(lastSig))) {
      j++;
      let inClass = false;
      while (j < src.length) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "[") inClass = true;
        else if (src[j] === "]") inClass = false;
        else if (src[j] === "/" && !inClass) break;
        j++;
      }
      // consume trailing flags
      while (j + 1 < src.length && /[a-z]/i.test(src[j + 1])) j++;
      lastSig = "/";
      continue;
    }
    // skip strings & template literals (template substitutions can themselves
    // hold braces, but none of the sliced engine functions nest braces inside a
    // template literal at top level, so a flat skip is sufficient here)
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      j++;
      while (j < src.length) {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === quote) break;
        j++;
      }
      lastSig = quote; // a string literal is a value
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
    if (!/\s/.test(ch)) lastSig = ch;
  }
  throw new Error("Unbalanced braces slicing: " + name);
}

/**
 * Slice a top-level `const NAME = <expr>;` declaration out of source. Used to
 * pull in module-level constants the engine functions depend on (e.g.
 * RECYCLE_THRESHOLD, DOJI_FLOOR_FRAC) so the sandboxed functions resolve them.
 */
export function sliceConst(src, name) {
  const re = new RegExp("const\\s+" + name + "\\s*=", "g");
  const m = re.exec(src);
  if (!m) throw new Error("Const not found: " + name);
  // scan to the terminating semicolon at depth 0 (skip strings/parens braces)
  let i = re.lastIndex, depth = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '"' || ch === "'" || ch === "`") {
      const q = ch; j++;
      while (j < src.length) { if (src[j] === "\\") { j += 2; continue; } if (src[j] === q) break; j++; }
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === ";" && depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error("No terminating semicolon for const: " + name);
}

// Module-level declarations that the engine functions close over. We always
// inject these so sliced functions resolve them; harmless if unused.
const SHARED_CONSTS = ["RECYCLE_THRESHOLD", "DOJI_FLOOR_FRAC"];
const SHARED_FUNCS = ["trueRange", "minWin", "maxWin"];

/**
 * Build a sandbox containing the requested engine functions. `extraGlobals`
 * lets parse tests stub `document`, etc. Returns the sandbox object so callers
 * can read the functions off it.
 */
export function loadEngine(names, extraGlobals = {}) {
  const src = readScriptBlock();
  const consts = SHARED_CONSTS.map((n) => { try { return sliceConst(src, n); } catch { return ""; } }).filter(Boolean);
  const helpers = SHARED_FUNCS.map((n) => { try { return sliceFunction(src, n); } catch { return ""; } }).filter(Boolean);
  const pieces = names.map((n) => sliceFunction(src, n)).join("\n\n");
  const sandbox = { ...extraGlobals };
  vm.createContext(sandbox);
  // Expose the sliced declarations, then attach them to the sandbox object.
  const exposer = consts.join("\n") + "\n" + helpers.join("\n\n") + "\n\n" + pieces + "\n\n;(()=>{" +
    names.map((n) => `globalThis.${n}=${n};`).join("") + "})();";
  vm.runInContext(exposer, sandbox, { filename: "demark-engine.sliced.js" });
  return sandbox;
}

/** Convenience: the cyclical demo generator from the HTML's "Load demo data". */
export function demoBars() {
  let seed = 20260611;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const bars = [];
  let price = 180;
  const start = new Date("2026-01-02");
  for (let i = 0; i < 170; i++) {
    const cycle = 22 * Math.sin(i / 7.5) + 8.8 * Math.sin(i / 3);
    const target = 180 + i * 0.16 + cycle;
    const o = price;
    let c = o + (target - o) * 0.32 + (rnd() - 0.5) * 2;
    c = Math.max(5, c);
    const h = Math.max(o, c) + rnd() * 1.3;
    const l = Math.min(o, c) - rnd() * 1.3;
    const d = new Date(start); d.setDate(d.getDate() + Math.floor(i * 1.4));
    bars.push({ t: d.toISOString().slice(0, 10), o: +o.toFixed(2), h: +h.toFixed(2), l: +l.toFixed(2), c: +c.toFixed(2), v: Math.round(3e7 + rnd() * 2e7) });
    price = c;
  }
  return bars;
}

/**
 * Build a deterministic ascending sequence of bars from an array of closes.
 * Highs/lows hug the close so TD comparisons (close vs close-4, close vs low-2)
 * are fully predictable. Dates increment by one day from 2026-01-01.
 */
export function barsFromCloses(closes, opts = {}) {
  const wickHi = opts.wickHi ?? 0.5;
  const wickLo = opts.wickLo ?? 0.5;
  const start = new Date("2026-01-01");
  return closes.map((c, i) => {
    const o = i === 0 ? c : closes[i - 1];
    const d = new Date(start); d.setDate(d.getDate() + i);
    return {
      t: d.toISOString().slice(0, 10),
      o: +o.toFixed(2),
      h: +(Math.max(o, c) + wickHi).toFixed(2),
      l: +(Math.min(o, c) - wickLo).toFixed(2),
      c: +c.toFixed(2),
      v: 1000000,
    };
  });
}
