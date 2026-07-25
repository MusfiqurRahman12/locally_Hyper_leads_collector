import type { AuditResult, Finding } from '@/types/prospect';
import { AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';

interface AuditPanelShellProps {
  title: string;
  score?: number;
  data?: AuditResult;
  scanDone?: boolean;
  children?: React.ReactNode;
}

export function AuditPanelShell({ title, score, data, scanDone, children }: AuditPanelShellProps) {
  if (!scanDone) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <Info size={24} className="mx-auto mb-3 text-gray-600" />
        <p className="text-gray-500 text-sm">Run a scan to see {title} results.</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">No {title} data available.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {score !== undefined && (
        <div className="flex items-center gap-3">
          <div className={`score-circle ${score >= 70 ? 'good' : score >= 40 ? 'avg' : 'poor'}`}>
            {score}
          </div>
          <div>
            <div className="text-sm font-medium text-white">{title} Score</div>
            <div className="text-xs text-gray-500">
              {score >= 70 ? 'Good' : score >= 40 ? 'Needs Improvement' : 'Poor'}
            </div>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}

export function FindingsList({ findings }: { findings: Finding[] }) {
  if (!findings || findings.length === 0) {
    return (
      <div className="flex items-center gap-2 text-green-400 text-sm">
        <CheckCircle size={16} /> No issues found
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {findings.map((f, i) => (
        <div key={i} className="glass rounded-lg p-3 flex gap-3">
          <div className="mt-0.5 shrink-0">
            {f.priority === 'HIGH' ? <XCircle size={14} className="text-red-400" /> :
             f.priority === 'MEDIUM' ? <AlertTriangle size={14} className="text-yellow-400" /> :
             <Info size={14} className="text-blue-400" />}
          </div>
          <div>
            <div className="text-xs font-medium text-white">{f.finding}</div>
            <div className="text-xs text-gray-500 mt-0.5">{f.evidence}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DataGrid({ items }: { items: Array<{ label: string; value: unknown; good?: boolean }> }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {items.map(({ label, value, good }) => (
        <div key={label} className="glass rounded-lg p-3">
          <div className="text-xs text-gray-500 mb-1">{label}</div>
          <div className={`text-sm font-medium ${
            good === true ? 'text-green-400' :
            good === false ? 'text-red-400' :
            'text-white'
          }`}>
            {value === true ? '✓ Yes' :
             value === false ? '✗ No' :
             value === null || value === undefined ? '—' :
             String(value)}
          </div>
        </div>
      ))}
    </div>
  );
}
