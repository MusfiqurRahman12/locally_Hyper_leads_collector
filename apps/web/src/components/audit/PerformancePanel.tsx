import type { AuditResult } from '@/types/prospect';
import { AuditPanelShell, FindingsList, DataGrid } from './AuditPanelShell';

function CWVMetric({ label, value, unit, thresholds }: { label: string; value?: number; unit: string; thresholds: [number, number] }) {
  const isGood = value !== undefined && value <= thresholds[0];
  const isOk = value !== undefined && value <= thresholds[1];
  const color = !value ? 'text-gray-600' : isGood ? 'text-green-400' : isOk ? 'text-yellow-400' : 'text-red-400';
  return (
    <div className="glass rounded-xl p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>
        {value !== undefined ? `${(value / 1000).toFixed(2)}${unit}` : '—'}
      </div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
      <div className={`text-xs mt-1 ${color}`}>
        {!value ? '' : isGood ? 'Good' : isOk ? 'Needs Work' : 'Poor'}
      </div>
    </div>
  );
}

export function PerformancePanel({ data, scanDone, onRunScan, isScanning }: { data?: AuditResult; scanDone?: boolean; onRunScan?: () => void; isScanning?: boolean }) {
  const d = data?.data as Record<string, Record<string, unknown>> | undefined;
  const mobile = d?.mobile as Record<string, unknown> | undefined;
  const scores = mobile?.scores as Record<string, number> | undefined;
  const cwv = mobile?.core_web_vitals as Record<string, { value?: number; display?: string }> | undefined;

  return (
    <AuditPanelShell title="Performance" score={scores?.performance} data={data} scanDone={scanDone} onRunScan={onRunScan} isScanning={isScanning}>
      {cwv && (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium text-white mb-3">Lighthouse Scores (Mobile)</h4>
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'Performance', val: scores?.performance },
                { label: 'Accessibility', val: scores?.accessibility },
                { label: 'Best Practices', val: scores?.best_practices },
                { label: 'SEO', val: scores?.seo },
              ].map(({ label, val }) => (
                <div key={label} className="glass rounded-xl p-3 text-center">
                  <div className={`text-2xl font-bold ${val && val >= 70 ? 'text-green-400' : val && val >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {val ?? '—'}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium text-white mb-3">Core Web Vitals</h4>
            <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
              <CWVMetric label="LCP" value={cwv.lcp?.value} unit="s" thresholds={[2500, 4000]} />
              <CWVMetric label="FCP" value={cwv.fcp?.value} unit="s" thresholds={[1800, 3000]} />
              <CWVMetric label="TTFB" value={cwv.ttfb?.value} unit="s" thresholds={[800, 1800]} />
              <CWVMetric label="TBT" value={cwv.tbt?.value} unit="s" thresholds={[200, 600]} />
              <div className="glass rounded-xl p-4 text-center">
                <div className={`text-2xl font-bold ${cwv.cls?.value !== undefined && cwv.cls.value < 0.1 ? 'text-green-400' : cwv.cls?.value !== undefined && cwv.cls.value < 0.25 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {cwv.cls?.display ?? '—'}
                </div>
                <div className="text-xs text-gray-500 mt-1">CLS</div>
              </div>
            </div>
          </div>

          {(data?.findings || []).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-white mb-3">Findings</h4>
              <FindingsList findings={data?.findings as never || []} />
            </div>
          )}
        </div>
      )}
    </AuditPanelShell>
  );
}
