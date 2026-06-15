# NMIS Fund Analysis

A sophisticated fund analysis tool that evaluates and recommends mutual funds based on risk-adjusted metrics, expense ratios, and consistent performance.

---

## DeMark Sequential — Robinhood Agentic Desk (`demark-trading.html`)

A zero-build, single-file tool that runs the **TD (DeMark) Sequential** indicator on
daily OHLC bars and proposes orders for **Robinhood Agentic Trading** (the MCP-based
feature that lets an AI agent trade a pre-funded agent wallet). Open the file directly
in a browser — no server or build step.

**Workflow (human-in-the-loop):**

1. **Fetch** — Your agent (Claude + Robinhood MCP) pulls ~120 daily OHLC bars for a
   symbol and pastes the JSON into the tool. Use the *Copy agent prompt* button to get
   a ready-made instruction. Accepts `{t,o,h,l,c,v}` or `{date,open,high,low,close}` keys.
2. **Compute** — The browser runs TD Sequential locally: buy/sell **Setups** (9) with
   perfection, **Countdowns** (13) with the countdown-bar-8 close qualifier, **TDST**
   support/resistance, and TD **risk stops**. Nothing leaves the page.
3. **Propose** — Each actionable signal becomes a `demark.order_intent.v1` object
   (side, limit price, risk-sized quantity, stop, 2R target, rationale,
   `requiresHumanApproval:true`).
4. **Approve & execute** — You review the intents; the agent submits the approved ones
   via Robinhood's MCP order tools. Stocks only in beta.

**Strategy backtest** — Before risking the agent wallet, the tool replays the signals as
a long/flat strategy over the loaded window (enter on buy triggers; exit on sell triggers,
the TD stop, or the 2R target) and reports total return vs. buy & hold, win rate, trade
count, max drawdown, exposure, an equity curve, and a trade log. Toggle between
*Countdown 13 only* and *Setup 9 + Countdown 13* entries.

Click **Load demo data** to see all four signal types and a full backtest on a synthetic series.

**Data input:** paste JSON (`{t,o,h,l,c,v}` or `date/open/high/low/close` keys) *or* a CSV
export (Yahoo/Nasdaq style — newest-first and `$`/comma formatting are handled).

**Connecting to your account:** see **[CONNECT-ROBINHOOD.md](CONNECT-ROBINHOOD.md)** for the
full setup — MCP endpoint `https://agent.robinhood.com/mcp/trading`, `claude mcp add`
command, agent-wallet funding, spending limits/manual approval, and the
fetch → compute → approve → execute loop. The in-app *Connect to your Robinhood account*
panel mirrors it, and *Copy execution prompt* hands your approved intents straight to the agent.

> Educational tool, not financial advice. Backtest before risking capital, and fund the
> agent wallet only with money you can afford to trade.

**Tests:** the DeMark engine is covered by a zero-dependency suite under `tests/` using
Node's built-in `node:test` runner (no `npm install` needed). The tests read
`demark-trading.html`, slice out the pure engine functions, and assert Setup-9 / Countdown-13
rules, deferred perfection, risk-stop direction, backtest invariants, and the JSON/CSV
parsers. Run them with Node 22+:

```sh
npm test        # or: node --test
```

CI runs the same suite on every push and pull request (`.github/workflows/test.yml`).

## Features

- **Account Type Selection**: Toggle between Taxable Brokerage and Roth IRA accounts
- **Risk Level Filtering**: Choose between Conservative, Moderate, and Aggressive fund allocations
- **Fund Cards**: Detailed fund information with expandable metrics
- **Performance Metrics**: 1Y, 3Y, and 5Y returns with category rank comparisons
- **Scoring System**: Composite score, expense ratio analysis, and rank consistency metrics
- **Responsive Design**: Works seamlessly on desktop and mobile devices

## Project Structure

```
├── index.html                 # Main HTML entry point
├── css/
│   └── styles.css            # All styling with CSS variables
├── js/
│   ├── app.js                # React app initialization
│   ├── components/
│   │   ├── NMISAnalysis.js   # Main app component
│   │   ├── FundCard.js       # Individual fund card component
│   │   ├── ScoreBadge.js     # Score display component
│   │   ├── RankPill.js       # Rank display component
│   │   └── MetricBar.js      # Visual metric bar component
│   ├── constants/
│   │   └── colors.js         # Color palette constants
│   └── data/
│       └── funds.js          # Fund data and metadata
└── README.md                 # This file
```

## Getting Started

1. Clone the repository
2. Open `index.html` in a modern web browser
3. No build step required - uses CDN for React and Babel

## Technology Stack

- **React 18**: UI framework (loaded from CDN)
- **Babel Standalone**: JSX transpilation in browser
- **CSS3**: Styling with CSS custom properties
- **Vanilla JavaScript**: Component logic

## Customization

### Adding New Funds

Edit `js/data/funds.js` to add new funds to the data structure:

```javascript
{
  ticker: 'XXXX',
  name: 'Fund Name',
  cat: 'Category',
  er: 0.75,           // Expense ratio
  r1y: 20.5,          // 1-year return
  rk1: 9,             // 1-year rank
  r3y: 24.61,         // 3-year return
  rk3: 9,             // 3-year rank
  r5y: 15.37,         // 5-year return
  rk5: 8,             // 5-year rank
  score: 90.8,        // Composite score
  consistency: 1.8,   // Rank consistency
  rationale: 'Fund rationale...'
}
```

### Adjusting Colors

Edit the color variables in `js/constants/colors.js` or the CSS variables in `css/styles.css`.

## Methodology

The fund analysis uses the following metrics:

- **Composite Score**: Weighted percentile ranks across 1Y (25%), 3Y (35%), and 5Y (40%) with expense ratio penalties
- **Rank Consistency**: Standard deviation of percentile ranks - lower values indicate stable outperformance
- **Return/Expense Ratio**: Annualized return divided by expense ratio to measure efficiency
- **Category Percentile Rank**: Morningstar ranking (1 = top, 100 = bottom)

## Browser Support

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## License

MIT
