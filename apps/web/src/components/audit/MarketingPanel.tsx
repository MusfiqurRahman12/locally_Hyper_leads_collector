import type { AuditResult } from '@/types/prospect';
import { AuditPanelShell, FindingsList, DataGrid } from './AuditPanelShell';

export function MarketingPanel({ data, scanDone, onRunScan, isScanning }: { data?: AuditResult; scanDone?: boolean; onRunScan?: () => void; isScanning?: boolean }) {
  const d = data?.data as Record<string, unknown> | undefined;
  const tools = d?.detected_tools as Array<{ key: string; name: string }> | undefined;

  return (
    <AuditPanelShell title="Marketing" score={data?.score} data={data} scanDone={scanDone} onRunScan={onRunScan} isScanning={isScanning}>
      {d && (
        <div className="space-y-4">
          <DataGrid items={[
            { label: 'Analytics', value: d.has_analytics as boolean, good: d.has_analytics as boolean },
            { label: 'GA4', value: d.has_ga4 as boolean, good: d.has_ga4 as boolean },
            { label: 'Tag Manager', value: d.has_gtm as boolean, good: d.has_gtm as boolean },
            { label: 'Retargeting', value: d.has_retargeting as boolean, good: d.has_retargeting as boolean },
            { label: 'Facebook Pixel', value: d.has_facebook_pixel as boolean, good: d.has_facebook_pixel as boolean },
            { label: 'LinkedIn Pixel', value: d.has_linkedin_pixel as boolean },
            { label: 'TikTok Pixel', value: d.has_tiktok_pixel as boolean },
            { label: 'Live Chat', value: d.has_chat as boolean },
            { label: 'Email Capture', value: d.has_email_capture as boolean, good: d.has_email_capture as boolean },
            { label: 'Cookie Consent', value: d.has_cookie_consent as boolean },
            { label: 'Total Pixels', value: d.total_pixels as number },
          ]} />

          {tools && tools.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-white mb-3">Detected Marketing Tools ({tools.length})</h4>
              <div className="flex flex-wrap gap-2">
                {tools.map(t => (
                  <span key={t.key} className="px-2 py-1 rounded-md bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300">
                    {t.name}
                  </span>
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
