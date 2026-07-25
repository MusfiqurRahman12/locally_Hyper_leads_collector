import type { RecommendedService } from '@/types/prospect';
import { CheckCircle, Zap } from 'lucide-react';

const SERVICE_COLORS: Record<string, string> = {
  'Website Development': '#6366f1',
  'Website Redesign': '#8b5cf6',
  'SEO': '#10b981',
  'Local SEO': '#059669',
  'Speed Optimization': '#f59e0b',
  'Security Hardening': '#ef4444',
  'Analytics Setup': '#3b82f6',
  'Conversion Tracking': '#06b6d4',
  'Marketing Automation': '#ec4899',
  'CRM Integration': '#14b8a6',
  'Booking System': '#a855f7',
  'Google Business Optimization': '#f97316',
  'Social Media Management': '#e879f9',
  'Hosting Migration': '#64748b',
  'Maintenance Plan': '#84cc16',
  'Accessibility Remediation': '#0ea5e9',
};

export function ServicesPanel({ services, scanDone }: { services: RecommendedService[]; scanDone?: boolean }) {
  if (!scanDone) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <Zap size={24} className="mx-auto mb-3 text-gray-600" />
        <p className="text-gray-500 text-sm">Run a scan to generate service recommendations.</p>
      </div>
    );
  }
  if (!services || services.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center">
        <CheckCircle size={24} className="mx-auto mb-3 text-green-500" />
        <p className="text-gray-400 text-sm">No service recommendations — this prospect has a strong digital presence.</p>
      </div>
    );
  }

  const high = services.filter(s => s.priority === 'HIGH');
  const medium = services.filter(s => s.priority === 'MEDIUM');
  const low = services.filter(s => s.priority === 'LOW');

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-400">
        <strong className="text-white">{services.length}</strong> recommended services based on audit findings.
      </p>

      {[
        { label: 'High Priority', items: high, color: '#ef4444' },
        { label: 'Medium Priority', items: medium, color: '#f59e0b' },
        { label: 'Lower Priority', items: low, color: '#10b981' },
      ].filter(g => g.items.length > 0).map(group => (
        <div key={group.label}>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3" style={{ color: group.color }}>
            {group.label}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {group.items.map((svc, i) => {
              const color = SERVICE_COLORS[svc.service] || '#6366f1';
              return (
                <div key={i} className="glass rounded-xl p-4 flex gap-3 hover:bg-white/5 transition-colors fade-up" style={{ animationDelay: `${i * 0.05}s` }}>
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
                    <Zap size={16} style={{ color }} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white">{svc.service}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{svc.reason}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
