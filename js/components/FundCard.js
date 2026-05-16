import { ScoreBadge } from './ScoreBadge.js';
import { RankPill } from './RankPill.js';
import { MetricBar } from './MetricBar.js';
import { COLORS } from '../constants/colors.js';

const { useState } = React;
const { NAVY_MID, GOLD, GRAY, WHITE, GOLD_DIM } = COLORS;

export function FundCard({ fund }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      onClick={() => setExpanded(!expanded)}
      style={{
        background: NAVY_MID,
        border: `1px solid ${expanded ? GOLD : 'rgba(201,168,76,0.12)'}`,
        borderRadius: 8,
        padding: '14px 16px',
        marginBottom: 8,
        cursor: 'pointer',
        transition: 'all 0.25s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ color: GOLD, fontWeight: 700, fontFamily: "'DM Mono',monospace", fontSize: 14, letterSpacing: 0.5 }}>{fund.ticker}</span>
            <ScoreBadge score={fund.score} />
          </div>
          <div style={{ color: WHITE, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{fund.name}</div>
          <div style={{ color: GRAY, fontSize: 11, marginTop: 2 }}>
            {fund.cat} | ER: {fund.er}%
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, flexShrink: 0 }}>
          {[
            { label: '1Y', val: fund.r1y, rank: fund.rk1 },
            { label: '3Y', val: fund.r3y, rank: fund.rk3 },
            { label: '5Y', val: fund.r5y, rank: fund.rk5 },
          ].map((p) => (
            <div key={p.label} style={{ textAlign: 'center', minWidth: 48 }}>
              <div style={{ color: GRAY, fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 2 }}>{p.label}</div>
              <div style={{ color: WHITE, fontSize: 13, fontWeight: 600, fontFamily: "'DM Mono',monospace" }}>{p.val !== null ? `${p.val.toFixed(1)}%` : '—'}</div>
              <div style={{ fontSize: 10, marginTop: 1 }}>
                R<RankPill rank={p.rank} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {expanded && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid rgba(201,168,76,0.1)` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ color: GRAY, fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>EXPENSE RATIO</div>
              <div style={{ color: fund.er <= 0.75 ? '#3ecf8e' : fund.er <= 1.0 ? GOLD : '#ef4444', fontSize: 16, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fund.er}%</div>
              <MetricBar value={2 - fund.er} max={2} color={fund.er <= 0.75 ? '#3ecf8e' : fund.er <= 1.0 ? GOLD : '#ef4444'} />
            </div>
            <div>
              <div style={{ color: GRAY, fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>COMPOSITE SCORE</div>
              <div style={{ color: fund.score >= 92 ? '#3ecf8e' : GOLD, fontSize: 16, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>{fund.score.toFixed(1)}</div>
              <MetricBar value={fund.score} max={100} color={fund.score >= 92 ? '#3ecf8e' : GOLD} />
            </div>
            <div>
              <div style={{ color: GRAY, fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>RANK CONSISTENCY</div>
              <div style={{ color: fund.consistency !== null ? fund.consistency <= 2 ? '#3ecf8e' : fund.consistency <= 5 ? GOLD : '#ef4444' : GRAY, fontSize: 16, fontWeight: 700, fontFamily: "'DM Mono',monospace" }}>
                {fund.consistency !== null ? fund.consistency.toFixed(1) : 'N/A'}
              </div>
              {fund.consistency !== null && <MetricBar value={20 - fund.consistency} max={20} color={fund.consistency <= 2 ? '#3ecf8e' : fund.consistency <= 5 ? GOLD : '#ef4444'} />}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <div style={{ color: GRAY, fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>RETURN/EXPENSE (3Y)</div>
              <div style={{ color: WHITE, fontSize: 14, fontWeight: 600, fontFamily: "'DM Mono',monospace" }}>{fund.r3y !== null ? (fund.r3y / fund.er).toFixed(1) + 'x' : '—'}</div>
            </div>
            <div>
              <div style={{ color: GRAY, fontSize: 10, fontWeight: 600, letterSpacing: 1, marginBottom: 4 }}>RETURN/EXPENSE (5Y)</div>
              <div style={{ color: WHITE, fontSize: 14, fontWeight: 600, fontFamily: "'DM Mono',monospace" }}>{fund.r5y !== null ? (fund.r5y / fund.er).toFixed(1) + 'x' : '—'}</div>
            </div>
          </div>

          <div style={{ background: GOLD_DIM, borderRadius: 6, padding: 12, borderLeft: `3px solid ${GOLD}` }}>
            <div style={{ color: '#e8d48b', fontSize: 10, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>SUITABILITY RATIONALE</div>
            <div style={{ color: WHITE, fontSize: 12, lineHeight: 1.5 }}>{fund.rationale}</div>
          </div>
        </div>
      )}
    </div>
  );
}
