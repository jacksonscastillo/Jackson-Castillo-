import { FundCard } from './FundCard.js';
import { COLORS } from '../constants/colors.js';
import { FUNDS } from '../data/funds.js';

const { useState } = React;
const { NAVY, GOLD, GOLD_DIM, GRAY, WHITE, GOLD_LIGHT } = COLORS;

export function NMISAnalysis() {
  const [accountType, setAccountType] = useState('taxable');
  const [riskLevel, setRiskLevel] = useState('moderate');
  const [showMethodology, setShowMethodology] = useState(false);

  const currentFunds = FUNDS[accountType]?.[riskLevel] || [];

  const contextNote =
    accountType === 'taxable'
      ? riskLevel === 'conservative'
        ? 'Taxable conservative: Prioritizing municipal bonds for tax exempt income, floating rate for rate protection, and low duration strategies for capital preservation.'
        : riskLevel === 'moderate'
        ? 'Taxable moderate: Balancing tax efficient equity (low turnover, qualified dividends) with muni fixed income. Emphasis on lowest expense ratios to maximize after tax returns.'
        : 'Taxable aggressive: Growth oriented equities with strong risk adjusted ranks. Consider tax loss harvesting pairs across international and sector funds.'
      : riskLevel === 'conservative'
      ? 'Roth conservative: Placing tax inefficient fixed income (TIPS, high yield, multisector) inside Roth to shelter ordinary income distributions from taxation.'
      : riskLevel === 'moderate'
      ? 'Roth moderate: Core equity holdings where capital gains compound tax free over decades. International funds shelter foreign dividend withholding complexity.'
      : 'Roth aggressive: Maximum growth compounding inside tax free wrapper. Sector concentration and EM volatility acceptable given Roth\'s permanent tax shelter and long horizon.';

  return (
    <div style={{ background: NAVY, minHeight: '100vh', color: WHITE, fontFamily: "'Inter','SF Pro',-apple-system,sans-serif" }}>
      {/* Header */}
      <div style={{ padding: '24px 20px 16px', borderBottom: `1px solid rgba(201,168,76,0.15)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 8, height: 8, background: GOLD, borderRadius: '50%' }} />
          <span style={{ color: GOLD, fontSize: 11, fontWeight: 600, letterSpacing: 2, textTransform: 'uppercase' }}>NMIS Brokerage Research List</span>
        </div>
        <h1 style={{ fontFamily: "'DM Serif Display',serif", fontSize: 22, fontWeight: 400, color: WHITE, margin: '4px 0', lineHeight: 1.2 }}>Risk Adjusted Fund Analysis</h1>
        <div style={{ color: GRAY, fontSize: 11 }}>Data as of December 31, 2025 | 1,944 funds screened</div>
      </div>

      {/* Account Type Toggle */}
      <div style={{ padding: '16px 20px 0' }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          {[{ key: 'taxable', label: 'Taxable Brokerage' }, { key: 'roth', label: 'Roth IRA' }].map((t) => (
            <button
              key={t.key}
              onClick={() => setAccountType(t.key)}
              style={{
                flex: 1,
                padding: '10px 12px',
                background: accountType === t.key ? GOLD : 'transparent',
                color: accountType === t.key ? '#0a1628' : GRAY,
                border: `1px solid ${accountType === t.key ? GOLD : 'rgba(201,168,76,0.2)'}`,
                borderRadius: 6,
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.2s',
                letterSpacing: 0.3,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Risk Tolerance Toggle */}
        <div style={{ display: 'flex', gap: 6 }}>
          {[
            { key: 'conservative', label: 'Conservative', icon: '◆' },
            { key: 'moderate', label: 'Moderate', icon: '◆◆' },
            { key: 'aggressive', label: 'Aggressive', icon: '◆◆◆' },
          ].map((r) => (
            <button
              key={r.key}
              onClick={() => setRiskLevel(r.key)}
              style={{
                flex: 1,
                padding: '8px 8px',
                background: riskLevel === r.key ? '#1a2d50' : 'transparent',
                color: riskLevel === r.key ? GOLD : GRAY,
                border: `1px solid ${riskLevel === r.key ? 'rgba(201,168,76,0.3)' : 'rgba(201,168,76,0.08)'}`,
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontSize: 8, marginBottom: 2, letterSpacing: 2 }}>{r.icon}</div>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Context Note */}
      <div style={{ padding: '12px 20px' }}>
        <div style={{ background: GOLD_DIM, borderRadius: 6, padding: 10, borderLeft: `3px solid ${GOLD}` }}>
          <div style={{ color: GOLD_LIGHT, fontSize: 11, lineHeight: 1.5 }}>{contextNote}</div>
        </div>
      </div>

      {/* Fund Cards */}
      <div style={{ padding: '0 20px 12px' }}>
        <div style={{ color: GRAY, fontSize: 10, fontWeight: 600, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' }}>Recommended Funds ({currentFunds.length}) — Tap to expand</div>
        {currentFunds.map((f) => (
          <FundCard key={f.ticker} fund={f} />
        ))}
      </div>

      {/* Methodology */}
      <div style={{ padding: '0 20px 32px' }}>
        <button
          onClick={() => setShowMethodology(!showMethodology)}
          style={{
            width: '100%',
            background: 'transparent',
            border: `1px solid rgba(201,168,76,0.15)`,
            borderRadius: showMethodology ? '6px 6px 0 0' : 6,
            padding: '12px 16px',
            color: GOLD,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            letterSpacing: 0.5,
          }}
        >
          <span>Scoring Methodology &amp; Risk Metrics</span>
          <span style={{ transform: showMethodology ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>▼</span>
        </button>

        {showMethodology && (
          <div style={{ background: '#132240', borderRadius: '0 0 6px 6px', padding: 16, border: `1px solid rgba(201,168,76,0.15)`, borderTop: 'none' }}>
            {[
              {
                title: 'COMPOSITE SCORE (0 to 100)',
                body: 'Weighted category percentile rank inversion: 5Y rank (40% weight) + 3Y rank (35%) + 1Y rank (25%). Ranks inverted so higher = better. Expense ratio penalty applied: each 50bp above category median reduces score by 1 point.',
              },
              {
                title: 'RANK CONSISTENCY (Standard Deviation)',
                body: 'Standard deviation of category percentile ranks across 1Y, 3Y, and 5Y periods. Lower = more consistent alpha generation. Scores below 2.0 indicate persistent outperformance.',
              },
              {
                title: 'RETURN / EXPENSE RATIO',
                body: 'Annualized return divided by prospectus net expense ratio. Measures return generated per unit of cost. Higher ratios indicate more efficient alpha extraction. A 3Y ratio above 50x is excellent.',
              },
              {
                title: 'CATEGORY PERCENTILE RANK',
                body: 'Morningstar category percentile rank where 1 = top of category and 100 = bottom. Green (top 5%), Gold (top 15%), Gray (top 30%), Red (below 30th percentile). Evaluated across multiple time horizons.',
              },
            ].map((s) => (
              <div key={s.title} style={{ marginBottom: 16 }}>
                <div style={{ color: GOLD, fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>{s.title}</div>
                <div style={{ color: WHITE, fontSize: 12, lineHeight: 1.6 }}>{s.body}</div>
              </div>
            ))}

            <div style={{ borderTop: `1px solid rgba(201,168,76,0.1)`, paddingTop: 12, marginTop: 4 }}>
              <div style={{ color: GOLD, fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>ADDITIONAL METRICS TO PULL</div>
              <div style={{ color: GRAY, fontSize: 11, lineHeight: 1.7 }}>
                For full due diligence via Morningstar Direct or Bloomberg: Sharpe Ratio (3Y, 5Y) | Sortino Ratio | Information Ratio vs benchmark | Alpha and Beta vs category index | Maximum Drawdown (trailing 5Y) | Upside/Downside Capture Ratios | Treynor Ratio | Standard Deviation (annualized) | R Squared vs benchmark | Tracking Error | Tax Cost Ratio (for taxable recs)
              </div>
            </div>

            <div style={{ borderTop: `1px solid rgba(201,168,76,0.1)`, paddingTop: 12, marginTop: 12 }}>
              <div style={{ color: GOLD, fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 8 }}>A SHARES VS C SHARES NOTE</div>
              <div style={{ color: GRAY, fontSize: 11, lineHeight: 1.7 }}>
                Analysis focuses on A shares for longer holding periods where the front load amortizes and lower ongoing ER compounds favorably vs C shares. At breakpoint levels ($100K+), effective load drops significantly. For positions under $25K with sub 3 year horizon, C shares may be more appropriate. All recommendations shown as A shares; C share equivalents available in underlying data.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
