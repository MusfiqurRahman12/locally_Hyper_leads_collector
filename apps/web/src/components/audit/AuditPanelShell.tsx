import type { AuditResult, Finding } from '@/types/prospect';
import { AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react';

interface AuditPanelShellProps {
  title: string;
  score?: number;
  data?: AuditResult;
  scanDone?: boolean;
  onRunScan?: () => void;
  isScanning?: boolean;
  children?: React.ReactNode;
}

export function AuditPanelShell({ title, score, data, scanDone, onRunScan, isScanning, children }: AuditPanelShellProps) {
  if (!scanDone) {
    return (
      <div className="glass rounded-xl p-8 text-center max-w-lg mx-auto my-6 border border-indigo-500/20 bg-indigo-500/5">
        <Info size={28} className="mx-auto mb-3 text-indigo-400" />
        <h4 className="text-base font-semibold text-white mb-1">{title} Audit Not Run Yet</h4>
        <p className="text-gray-400 text-xs mb-4 leading-relaxed">
          Run an AI scan to analyze {title.toLowerCase()} metrics, detect vulnerabilities, and extract phone, email & decision maker details.
        </p>
        {onRunScan && (
          <button
            onClick={onRunScan}
            disabled={isScanning}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 inline-flex items-center gap-2 shadow-lg shadow-indigo-500/20"
          >
            {isScanning ? 'Scanning in progress…' : `Run Scan for ${title}`}
          </button>
        )}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <p className="text-gray-500 text-sm">No {title} data available for this business.</p>
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
