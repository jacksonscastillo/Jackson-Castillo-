# Connecting the DeMark desk to Robinhood Agentic Trading

`demark-trading.html` generates **signals and order intents**. It never touches your
brokerage account. Execution happens through **Robinhood Agentic Trading** (beta) — a
Model Context Protocol (MCP) server you connect an AI agent to. You approve every order.

> Stocks only in the current beta. Educational tool, not financial advice. Always verify
> the MCP URL on Robinhood's own support page before connecting, and only fund the agent
> wallet with money you can afford to trade.

## 1. Open the tool

It's a single static file — no build, no server.

- **Locally:** download the repo and double-click `demark-trading.html`.
- **Hosted (recommended for mobile):** enable GitHub Pages on this repo
  (Settings → Pages → Source: `main`, folder `/root`). After it builds, open
  `https://jacksonscastillo.github.io/Jackson-Castillo-/demark-trading.html`.

## 2. Connect your agent to Robinhood's MCP server

MCP endpoint: `https://agent.robinhood.com/mcp/trading`

- **Claude Code:**
  ```
  claude mcp add robinhood-trading --transport http https://agent.robinhood.com/mcp/trading
  ```
- **Claude Desktop:** Settings → Connectors → **Add custom connector** → paste the URL.
- **Codex / Cursor / ChatGPT:** add the same URL in that client's MCP config.

## 3. Authenticate, fund, and set guardrails

Robinhood's OAuth flow (your agent never sees your password):

1. Create a separate **agent sub-account** when prompted.
2. Move a **dedicated budget** into its sandboxed wallet — the agent can only spend what's
   inside it.
3. Set a **spending limit** and enable **manual approval** so you confirm each order.

Every trade appears in your Robinhood **Activity**, and you can disconnect the agent
anytime from the app.

## 4. Run the loop

1. **Fetch** — in the tool, click **Copy fetch prompt** and send it to your connected
   agent. It returns ~120 daily OHLC bars as JSON. (Or paste a CSV export from
   Yahoo/Nasdaq directly — the tool also accepts CSV.)
2. **Compute** — paste the bars into the tool and click **Compute signals**. Review the
   chart, signals table, and the **backtest** (validate before trading).
3. **Approve** — read the generated `demark.order_intent.v1` objects. Delete any you don't
   want; adjust limit prices if needed.
4. **Execute** — click **Copy execution prompt** (it embeds your approved intents) and send
   it to your agent. The agent places each order via the MCP `place_order` tool exactly as
   specified and reports back fills. With manual approval on, you still confirm each one in
   Robinhood.

## Order intent schema (`demark.order_intent.v1`)

```jsonc
{
  "schema": "demark.order_intent.v1",
  "broker": "robinhood-agentic",
  "account": "agent-wallet",
  "symbol": "AAPL",
  "side": "buy",            // or "sell"
  "type": "limit",
  "limitPrice": 186.90,     // defaults to the signal bar's close
  "quantity": 12,           // wallet * risk% / risk-per-share, capped by buying power
  "timeInForce": "gtc",
  "signal": { "indicator": "TD Sequential", "event": "Buy Countdown 13", "date": "2026-05-12", "perfected": true },
  "risk": { "stop": 178.40, "target": 203.90, "riskPerShare": 8.50, "riskBudget": 50.0 },
  "rationale": "…",
  "requiresHumanApproval": true
}
```

The agent must place orders **exactly** as written — it never sizes positions itself.
