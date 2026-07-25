import type { AuditResult } from '@/types/prospect';
import { AuditPanelShell, FindingsList } from './AuditPanelShell';

export function TechStackPanel({ data, scanDone }: { data?: AuditResult; scanDone?: boolean }) {
  const d = data?.data as Record<string, unknown> | undefined;
  const byCategory = d?.by_category as Record<string, string[]> | undefined;
  const technologies = d?.technologies as Array<{ name: string; category: string; version?: string }> | undefined;

  return (
    <AuditPanelShell title="Technology" data={data} scanDone={scanDone}>
      {d && (
        <div className="space-y-4">
          <div className="flex gap-3 flex-wrap">
            {[
              { label: 'CMS', value: d.cms as string || 'Unknown' },
              { label: 'Analytics', value: d.has_analytics ? 'Detected' : 'None', bad: !d.has_analytics },
              { label: 'Ecommerce', value: d.has_ecommerce ? 'Detected' : 'None' },
              { label: 'CRM', value: d.has_crm ? 'Detected' : 'None' },
              { label: 'Chat', value: d.has_chat ? 'Detected' : 'None' },
              { label: 'CDN', value: d.has_cdn ? 'Detected' : 'None', bad: !d.has_cdn },
              { label: 'Source', value: d.source as string },
            ].map(({ label, value, bad }) => (
              <div key={label} className="glass rounded-lg px-3 py-2">
                <div className="text-xs text-gray-500">{label}</div>
                <div className={`text-sm font-medium capitalize mt-0.5 ${bad ? 'text-red-400' : 'text-white'}`}>{value}</div>
              </div>
            ))}
          </div>

          {byCategory && Object.keys(byCategory).length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-white mb-3">Detected Technologies</h4>
              <div className="space-y-3">
                {Object.entries(byCategory).map(([cat, techs]) => (
                  <div key={cat}>
                    <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">{cat}</div>
                    <div className="flex flex-wrap gap-2">
                      {techs.map(t => (
                        <span key={t} className="px-2 py-1 rounded-md bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
                          {t}
                        </span>
                      ))}
                    </div>
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
