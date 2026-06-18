# GO-LIVE — from the finished tool to your first real trade

The DeMark desk is built, tested (47 tests, green CI), and hosted. This is the
exact sequence to take it from "working software" to a first **real but tiny**
trade on Robinhood — without skipping the validation that protects your money.

> Educational tool, not financial advice. DeMark Sequential is a discretionary
> indicator with no guaranteed edge. Only fund the agent wallet with money you
> can afford to lose, and keep **manual approval on** until you fully trust it.

---

## Stage 0 — Open the tool

- **Hosted (any device):** https://jacksonscastillo.github.io/Jackson-Castillo-/demark-trading.html
- **Local:** open `demark-trading.html` in a browser.

Click **Load demo data** once to confirm it renders (chart, signals, backtest).

---

## Stage 1 — Validate the strategy on REAL data  *(do this before any money)*

The engine is conservative by design (it cancels countdowns on a trend break and
requires a price flip to start a setup). Confirm that on *your* tickers it still
produces usable signals.

1. Get real daily bars for 3–5 tickers you actually follow:
   - Easiest: in Robinhood-connected Claude, use **Copy fetch prompt** from the tool and send it.
   - Or download a CSV from Yahoo/Nasdaq and paste it (the tool accepts CSV directly).
2. For each ticker: **Compute signals** and check:
   - Do **Buy/Sell Setup 9** and **Countdown 13** signals appear at sensible turning points on the chart?
   - In the **backtest**, how does the strategy compare to buy & hold? Look at win rate, max drawdown, and **how many trades** it took (too few = not enough signal; check both *Countdown 13 only* and *Setup 9 + Countdown 13*).
3. Decide: are the signals frequent and sane enough to act on? If countdowns almost never fire on your data, tell me — we can tune the cancellation rules.

**Gate:** Do not proceed until the backtest and signals look reasonable to you on real data.

---

## Stage 2 — Connect Robinhood Agentic Trading  *(see CONNECT-ROBINHOOD.md for detail)*

1. Connect your agent to the MCP server `https://agent.robinhood.com/mcp/trading`:
   - Claude Code: `claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading`
   - Claude Desktop: Settings → Connectors → Add custom connector → paste the URL.
2. Complete Robinhood's OAuth → create the **separate agent sub-account**.
3. **Fund the agent wallet small** — start with an amount a single bad trade wouldn't hurt (e.g. enough for 1–5 shares of your test ticker).
4. Set a **spending limit** and turn **manual approval ON**.

**Gate:** Confirm in the Robinhood app that the agent wallet exists, is funded with the small amount, and manual approval is enabled.

---

## Stage 3 — One real trade, end to end

1. In the tool, load fresh bars for one ticker and **Compute signals**.
2. Review the generated `demark.order_intent.v1` objects. Sanity-check each:
   - `quantity` fits the wallet, `limitPrice` is near the current price, `risk.stop` is on the correct side, `ageBars` is small (signal is recent).
   - Delete any intent you don't want.
3. Click **Copy execution prompt** (it embeds your approved intents) and send it to your Robinhood-connected agent.
4. The agent calls `place_order`; **you approve the order in Robinhood**.
5. Confirm the fill in Robinhood's **Activity**.

---

## Stage 4 — Operate the loop

- Re-run on your schedule (daily for daily bars). Buys open/add a long; **sell signals close the long only** (the tool never opens shorts).
- Keep a simple log of signal → action → result for a few weeks before increasing size or relaxing manual approval.
- Disconnect the agent anytime from the Robinhood app.

---

## Safety guarantees baked into the tool

- Proposes orders only — **you approve every one**; the agent can only spend the sandboxed wallet.
- No accidental shorts, no zero/garbage-quantity orders, no stale-signal orders (recency-gated).
- Bars are validated and sorted; bad OHLC is rejected before it can produce a signal.
- Backtest is look-ahead-free, so its numbers are honest.

## If something looks off

Tell me the ticker and what you saw (e.g. "no countdowns ever fire", "a stop looked wrong").
The engine is fully test-covered, so changes are safe to make and verify quickly.
