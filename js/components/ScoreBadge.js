import { COLORS } from '../constants/colors.js';

const { GREEN, GOLD, GRAY, RED } = COLORS;

export function ScoreBadge({ score }) {
  const color = score >= 92 ? GREEN : score >= 85 ? GOLD : score >= 75 ? GRAY : RED;
  return (
    <span
      style={{
        background: `${color}22`,
        color,
        padding: '2px 10px',
        borderRadius: 4,
        fontWeight: 700,
        fontSize: 13,
        fontFamily: "'DM Mono',monospace",
      }}
    >
      {score.toFixed(1)}
    </span>
  );
}
