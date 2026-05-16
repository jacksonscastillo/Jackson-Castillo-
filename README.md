# NMIS Fund Analysis

A sophisticated fund analysis tool that evaluates and recommends mutual funds based on risk-adjusted metrics, expense ratios, and consistent performance.

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
