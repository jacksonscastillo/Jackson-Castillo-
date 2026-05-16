import { COLORS } from '../constants/colors.js';

const { GREEN, GOLD, GRAY, RED } = COLORS;

export function RankPill({ rank }) {
  if (rank === null || rank === undefined) return <span style={{ color: GRAY, fontSize: 12 }}>N/A</span>;
  const color = rank <= 5 ? GREEN : rank <= 15 ? GOLD : rank <= 30 ? GRAY : RED;
  return (
    <span style={{ color, fontWeight: 600, fontFamily: "'DM Mono',monospace", fontSize: 13 }}>{rank === 0 ? 'Top' : `${rank}`}</span>
  );
}
