# NMIS Fund Analysis

A sophisticated fund analysis tool that evaluates and recommends mutual funds based on risk-adjusted metrics, expense ratios, and consistent performance.

---

## Budget Optimizer (`budget.html`)

A zero-build, single-file spending analyzer. Drop in a transaction CSV export and it
breaks down where the money goes, finds the recurring charges, audits fees, and ranks
what it would be worth to change. Open the file directly in a browser — no server, no
build step, no dependencies.

**Your data stays yours.** The CSV is parsed in the page and kept in that browser's
`localStorage`. Nothing is uploaded and no request is made with your transactions. Use
*Clear stored data* to remove it.

### What it reads

Any export with Date, Description, Amount columns — Monarch, Empower, Mint, Copilot and
most direct bank exports. Column names are matched fuzzily; `Associated Account`,
`Category` and `Type` are used when present. Amounts parse in `- $1,234.56`, `($5.00)`
and bare-number forms.

### What it does

- **Excludes internal movement.** Transfers between your own accounts, credit-card
  payments and securities trades are money moving, not money spent, and never appear in
  a spending figure.
- **Uses complete months only.** A partial month at either end of the export would drag
  every per-month average down, so rates are computed over full months. Partial months
  still show in the chart, dimmed.
- **Separates subscriptions from habits.** A steady amount on a steady cadence is a
  contract you can cancel. A merchant you visit constantly for varying amounts is a
  behaviour you can change. They get different tables because they need different
  decisions. Charges that were monthly and then stopped are flagged *gone quiet* —
  confirm they were actually cancelled.
- **Audits fees.** Card annual fees, interest, balance-transfer fees, out-of-network ATM
  charges and service fees, bucketed by kind. Patterns are word-anchored, so "COFFEE" is
  not read as a fee.
- **Ranks cuts with dollars attached.** Every recommendation cites the transactions
  behind it. Estimates are labelled as estimates; everything else is counted. A slider
  per item sets how much of it you would actually do, and the total follows.

### Two things it deliberately will not do

- **It never tells you to cut protection.** Insurance, healthcare, tuition, housing and
  debt principal are reported and charted, and a spike in them is flagged as information
  — but they never become a "savings opportunity".
- **It never double-counts.** Several rules can point at the same category — a
  cut-dining item and a delivery-markup item are partly the same dollars. Claims on one
  category are capped at a share of that category, largest first, so the headline total
  is a number you could actually realize.

If recorded income does not cover recorded spending, the page says so and suppresses
savings-rate figures rather than reporting a wrong one — usually it means a paycheck
lands in an account that was not part of the export.

### Tests

`node --test tests/budget.test.mjs` — the engine functions are sliced out of the page's
`<script>` block and run directly, so the tests exercise the exact source that ships.

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

**Going live:** **[GO-LIVE.md](GO-LIVE.md)** is the step-by-step runbook from the hosted
tool → validating signals on real data → funding the agent wallet → your first tiny trade,
with the safety gates at each stage.

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

## Two by Four — Fixed Activity Commitment card (`two-by-four.html`)

A shared daily-activity tracker for the whole office, built to run on everyone's
phone from one link. It implements O. Alfred Granum's Fixed Activity Commitment
Chart from the One Card System: **set 2 fact finders and obtain 4 qualified
suspects** in a day, and one box of a 200-box card is stamped with the date.
Do one of the two and the box stays open.

Five views: **Today** (two counters with rings and steppers, seven-day back-fill,
vacation and training days that protect a streak), **Card** (the 200 boxes, each
kept day stamped, plus the 30-box vacation and training grids), **Standings**
(live leaderboard by boxes, streak, kept rate, or monthly activity points),
**Office** (management view behind a code — who logged today, who hasn't,
streaks, rates, weekly totals, CSV export, PIN reset), and **Me**.

Like the other pages here it is one standalone HTML file with no build step, no
framework, and no external JavaScript. It ships on this repo's GitHub Pages site;
the office opens the same URL on their phones.

### Setup

Run [`two-by-four-schema.sql`](two-by-four-schema.sql) once in the Supabase SQL
editor — the same project the dashboard and the Granum game use. That creates
`two_by_four_cards` with its policies and grants. Nothing else to configure.

### How the sharing works

- One row per person, the whole card held as a `days` JSON object keyed by date.
- The page talks to PostgREST with the browser's own `fetch` and the public anon
  key, the same approach `granum-game.html` uses: no SDK for a content blocker to
  break, and no realtime WebSocket, which Safari and office wifi often drop. The
  board stays live by polling every 10 seconds while the tab is visible.
- It renders from a local cache instantly on open, keeps working and keeps
  logging when the board is unreachable, and merges remote and local day by day
  on the newer timestamp so two phones logging the same person never lose an
  entry. Writes are debounced, connection failures retry with backoff, and a
  request the server rejects outright is not retried.

### What not to put in it

Identity is a name plus a 4-digit PIN hashed with SHA-256. The PIN keeps a card
from being opened by someone else by accident; it is not a security lock and is
not enforced server-side. The page is on the open web and the anon key ships in
it, so the URL is what keeps the board private. Activity counts only — never
client names or contact details.

The brief it was built from is in [`two-by-four-prompt.md`](two-by-four-prompt.md).

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
