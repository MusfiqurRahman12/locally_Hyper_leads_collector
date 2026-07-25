export function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) {
    return <span className="text-xs text-gray-600">—</span>;
  }
  const color = score >= 60 ? '#ef4444' : score >= 30 ? '#f59e0b' : '#10b981';
  const bg = score >= 60 ? 'rgba(239,68,68,0.12)' : score >= 30 ? 'rgba(245,158,11,0.12)' : 'rgba(16,185,129,0.12)';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold"
      style={{ color, background: bg, border: `1px solid ${color}30` }}
    >
      {score}
    </span>
  );
}
