export function MetricBar({ value, max, color }) {
  return (
    <div style={{ width: '100%', height: 4, background: 'rgba(10,22,40,0.8)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min((value / max) * 100, 100)}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
    </div>
  );
}
