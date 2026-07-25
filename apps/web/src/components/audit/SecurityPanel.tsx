import type { AuditResult } from '@/types/prospect';
import { AuditPanelShell, FindingsList, DataGrid } from './AuditPanelShell';
import { ShieldCheck, ShieldX } from 'lucide-react';

export function SecurityPanel({ data, scanDone }: { data?: AuditResult; scanDone?: boolean }) {
  const d = data?.data as Record<string, unknown> | undefined;
  const ssl = d?.ssl as Record<string, unknown> | undefined;
  const headersMissing = d?.headers_missing as string[] | undefined;
  const headersPresent = d?.headers_present as Record<string, string> | undefined;
  const exposedPaths = d?.exposed_paths as Array<{ path: string; label: string }> | undefined;

  return (
    <AuditPanelShell title="Security" score={data?.score} data={data} scanDone={scanDone}>
      {d && (
        <div className="space-y-4">
          <DataGrid items={[
            { label: 'HTTPS Enforced', value: d.https_enforced as boolean, good: d.https_enforced as boolean },
            { label: 'HTTP → HTTPS', value: d.http_redirects_to_https as boolean, good: d.http_redirects_to_https as boolean },
            { label: 'SSL Valid', value: ssl?.ssl_valid as boolean, good: ssl?.ssl_valid as boolean },
            { label: 'SSL Days Left', value: ssl?.ssl_days_remaining as number, good: Number(ssl?.ssl_days_remaining) > 30 },
            { label: 'SSL Issuer', value: ssl?.ssl_issuer as string || '—' },
            { label: 'Mixed Content Risk', value: d.mixed_content_risk as boolean, good: !d.mixed_content_risk },
          ]} />

          {/* Security Headers */}
          <div>
            <h4 className="text-sm font-medium text-white mb-3">Security Headers</h4>
            <div className="space-y-1.5">
              {['content-security-policy','strict-transport-security','x-frame-options','x-content-type-options','x-xss-protection','referrer-policy','permissions-policy'].map(h => {
                const present = headersPresent?.[h];
                return (
                  <div key={h} className="flex items-center gap-2 text-xs">
                    {present ? <ShieldCheck size={12} className="text-green-400 shrink-0" /> : <ShieldX size={12} className="text-red-400 shrink-0" />}
                    <span className={present ? 'text-gray-300' : 'text-gray-500'}>{h}</span>
                    {present && <span className="text-gray-600 truncate max-w-[200px]">{present}</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Exposed paths */}
          {exposedPaths && exposedPaths.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-red-400 mb-3">⚠ Exposed Paths</h4>
              <div className="space-y-2">
                {exposedPaths.map(ep => (
                  <div key={ep.path} className="glass rounded-lg px-3 py-2 flex items-center gap-2 border border-red-500/20">
                    <ShieldX size={12} className="text-red-400" />
                    <span className="text-xs text-red-300 font-medium">{ep.label}</span>
                    <span className="text-xs text-gray-500">{ep.path}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <FindingsList findings={data?.findings as never || []} />
        </div>
      )}
    </AuditPanelShell>
  );
}
