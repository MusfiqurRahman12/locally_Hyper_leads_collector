export function PriorityBadge({ priority }: { priority: string }) {
  const cls =
    priority === 'HIGH' ? 'badge-high' :
    priority === 'MEDIUM' ? 'badge-medium' :
    'badge-low';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${cls}`}>
      {priority}
    </span>
  );
}
