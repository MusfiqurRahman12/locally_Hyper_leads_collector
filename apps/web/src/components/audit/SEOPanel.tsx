import type { AuditResult } from '@/types/prospect';
import { AuditPanelShell, FindingsList, DataGrid } from './AuditPanelShell';

export function SEOPanel({ data, scanDone }: { data?: AuditResult; scanDone?: boolean }) {
  const d = data?.data as Record<string, unknown> | undefined;
  return (
    <AuditPanelShell title="SEO" score={data?.score} data={data} scanDone={scanDone}>
      {d && (
        <div className="space-y-4">
          <DataGrid items={[
            { label: 'Page Title', value: d.title as string || '—', good: !!(d.title) },
            { label: 'Title Length', value: `${d.title_length} chars`, good: Number(d.title_length) >= 30 && Number(d.title_length) <= 65 },
            { label: 'Meta Description', value: d.meta_description ? `${d.meta_description_length} chars` : 'Missing', good: !!(d.meta_description) },
            { label: 'H1 Count', value: d.h1_count as number, good: d.h1_count === 1 },
            { label: 'Canonical', value: d.canonical ? 'Present' : 'Missing', good: !!(d.canonical) },
            { label: 'Open Graph', value: d.has_open_graph as boolean, good: d.has_open_graph as boolean },
            { label: 'Schema Markup', value: d.has_schema_markup as boolean, good: d.has_schema_markup as boolean },
            { label: 'XML Sitemap', value: d.has_sitemap as boolean, good: d.has_sitemap as boolean },
            { label: 'Robots.txt', value: d.has_robots as boolean, good: d.has_robots as boolean },
            { label: 'Images Missing Alt', value: `${d.images_missing_alt}/${d.images_total}`, good: d.images_missing_alt === 0 },
            { label: 'Twitter Cards', value: d.has_twitter_cards as boolean, good: d.has_twitter_cards as boolean },
            { label: 'Internal Links', value: d.internal_links_count as number },
          ]} />
          <div>
            <h4 className="text-sm font-medium text-white mb-3">SEO Findings</h4>
            <FindingsList findings={(data?.findings || []) as never} />
          </div>
        </div>
      )}
    </AuditPanelShell>
  );
}
