'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Globe, Phone, Mail, MapPin, Star, ScanLine, User,
  ExternalLink, Clock, Shield, Zap, Search, Layers, Target,
  CheckCircle, AlertTriangle, XCircle, ChevronRight, Loader2
} from 'lucide-react';
import { getProspect, triggerScan, getScanStatus } from '@/lib/api';
import { ScoreBadge } from '@/components/prospects/ScoreBadge';
import { PriorityBadge } from '@/components/prospects/PriorityBadge';
import { SEOPanel } from '@/components/audit/SEOPanel';
import { PerformancePanel } from '@/components/audit/PerformancePanel';
import { SecurityPanel } from '@/components/audit/SecurityPanel';
import { TechStackPanel } from '@/components/audit/TechStackPanel';
import { MarketingPanel } from '@/components/audit/MarketingPanel';
import { PainPointsPanel } from '@/components/audit/PainPointsPanel';
import { ServicesPanel } from '@/components/audit/ServicesPanel';
import Link from 'next/link';

const TABS = [
  { key: 'overview', label: 'Overview', icon: Layers },
  { key: 'pain_points', label: 'Pain Points', icon: Target },
  { key: 'services', label: 'Services', icon: CheckCircle },
  { key: 'seo', label: 'SEO', icon: Search },
  { key: 'performance', label: 'Performance', icon: Zap },
  { key: 'security', label: 'Security', icon: Shield },
  { key: 'technology', label: 'Technology', icon: Layers },
  { key: 'marketing', label: 'Marketing', icon: Target },
];

export default function ProspectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const qc = useQueryClient();
  const id = params.id as string;
  const [activeTab, setActiveTab] = useState('overview');
  const [scanPollInterval, setScanPollInterval] = useState<number | false>(false);

  const { data: prospect, isLoading, refetch } = useQuery({
    queryKey: ['prospect', id],
    queryFn: () => getProspect(id),
    refetchInterval: scanPollInterval,
  });

  const scan = prospect?.scan;

  // Auto-poll while scan is running
  useEffect(() => {
    if (scan?.status === 'RUNNING' || scan?.status === 'PENDING') {
      setScanPollInterval(2000);
    } else {
      setScanPollInterval(false);
    }
  }, [scan?.status]);

  const { mutate: startScan, isPending: isStartingScan } = useMutation({
    mutationFn: () => triggerScan(id),
    onSuccess: () => {
      setScanPollInterval(2000);
      refetch();
    },
    onError: () => {
      setScanPollInterval(2000);
      refetch();
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-indigo-400" />
      </div>
    );
  }

  if (!prospect) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400">Prospect not found</p>
          <Link href="/dashboard" className="text-indigo-400 text-sm mt-2 block hover:underline">← Back to dashboard</Link>
        </div>
      </div>
    );
  }

  const isScanRunning = scan?.status === 'RUNNING' || scan?.status === 'PENDING';

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <div className="border-b border-white/5 px-6 py-4 sticky top-0 z-10 bg-gray-950/90 backdrop-blur">
        <div className="flex items-start gap-4">
          <Link href="/dashboard" className="mt-1 text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-white truncate">{prospect.name}</h1>
              {prospect.priority && <PriorityBadge priority={prospect.priority} />}
              {prospect.lead_score !== undefined && <ScoreBadge score={prospect.lead_score} />}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {[prospect.category, prospect.city, prospect.state].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isScanRunning ? (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20">
                <Loader2 size={14} className="animate-spin text-indigo-400" />
                <span className="text-xs text-indigo-400">{scan?.current_stage || 'Scanning…'}</span>
                <span className="text-xs text-indigo-300 font-medium">{scan?.progress_pct}%</span>
              </div>
            ) : (
              <button
                onClick={() => startScan()}
                disabled={isStartingScan}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                <ScanLine size={14} />
                {scan?.status === 'DONE' ? 'Re-scan' : 'Run Scan'}
              </button>
            )}
          </div>
        </div>

        {/* Scan progress bar */}
        {isScanRunning && (
          <div className="mt-3 h-1 bg-white/5 rounded-full overflow-hidden">
            <div className="progress-bar h-full rounded-full" style={{ width: `${scan?.progress_pct || 0}%` }} />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 mt-4 overflow-x-auto pb-0.5">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                activeTab === tab.key
                  ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                  : 'text-gray-500 hover:text-white hover:bg-white/5'
              }`}
            >
              <tab.icon size={12} />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="flex-1 p-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {/* Contact info */}
            <div className="glass rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Contact Information</h3>
              <div className="space-y-3">
                {prospect.owner_name && (
                  <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/20 mb-3">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-400">
                      <User size={13} /> Decision Maker
                    </div>
                    <div className="text-sm font-medium text-white mt-1">
                      {prospect.owner_name} {prospect.contact_details?.decision_maker_title ? `(${prospect.contact_details.decision_maker_title})` : ''}
                    </div>
                    {prospect.contact_details?.decision_maker_phone && (
                      <a href={`tel:${prospect.contact_details.decision_maker_phone}`} className="text-xs text-indigo-300 hover:underline flex items-center gap-1 mt-1.5">
                        <Phone size={12} /> Direct: {prospect.contact_details.decision_maker_phone}
                      </a>
                    )}
                    {prospect.contact_details?.decision_maker_email && (
                      <a href={`mailto:${prospect.contact_details.decision_maker_email}`} className="text-xs text-indigo-300 hover:underline flex items-center gap-1 mt-1">
                        <Mail size={12} /> {prospect.contact_details.decision_maker_email}
                      </a>
                    )}
                  </div>
                )}
                {prospect.phone && (
                  <InfoRow
                    icon={<Phone size={14} />}
                    label={prospect.contact_details?.phone_type === 'decision_maker' ? 'Direct Phone' : 'Business Phone'}
                    value={prospect.phone}
                    href={`tel:${prospect.phone}`}
                  />
                )}
                {prospect.email && (
                  <InfoRow icon={<Mail size={14} />} label="Email" value={prospect.email} href={`mailto:${prospect.email}`} />
                )}
                {prospect.website && (
                  <InfoRow icon={<Globe size={14} />} label="Website" value={prospect.website.replace(/^https?:\/\//, '')} href={prospect.website} external />
                )}
                {prospect.maps_url && (
                  <InfoRow icon={<MapPin size={14} />} label="Maps" value="View on OpenStreetMap" href={prospect.maps_url} external />
                )}
                {!prospect.phone && !prospect.email && !prospect.website && !prospect.owner_name && (
                  <p className="text-xs text-gray-500">No contact info found</p>
                )}
              </div>
            </div>

            {/* Business details */}
            <div className="glass rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">Business Details</h3>
              <div className="space-y-2">
                <DetailRow label="Category" value={prospect.category} />
                <DetailRow label="Address" value={prospect.address} />
                <DetailRow label="City" value={[prospect.city, prospect.state].filter(Boolean).join(', ')} />
                <DetailRow label="Rating" value={prospect.google_rating ? `★ ${prospect.google_rating}` : undefined} />
                <DetailRow label="Reviews" value={prospect.review_count?.toString()} />
                <DetailRow label="Status" value={prospect.business_status} />
                <DetailRow label="Source" value={prospect.data_source} />
                <DetailRow label="Last Scan" value={prospect.last_scan_date ? new Date(prospect.last_scan_date).toLocaleDateString() : 'Never'} />
              </div>
            </div>

            {/* Social links */}
            {prospect.social_links && Object.values(prospect.social_links).some(Boolean) && (
              <div className="glass rounded-xl p-5">
                <h3 className="text-sm font-semibold text-white mb-4">Social Media</h3>
                <div className="space-y-2">
                  {Object.entries(prospect.social_links)
                    .filter(([, v]) => v)
                    .map(([platform, url]) => (
                      <a
                        key={platform}
                        href={url as string}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                      >
                        <ExternalLink size={11} />
                        {platform.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </a>
                    ))
                  }
                </div>
              </div>
            )}

            {/* Description */}
            {prospect.description && (
              <div className="glass rounded-xl p-5 md:col-span-2 xl:col-span-3">
                <h3 className="text-sm font-semibold text-white mb-2">Description</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{prospect.description}</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'pain_points' && <PainPointsPanel painPoints={prospect.pain_points || []} scanDone={scan?.status === 'DONE'} onRunScan={() => startScan()} isScanning={isScanRunning} />}
        {activeTab === 'services' && <ServicesPanel services={prospect.recommended_services || []} scanDone={scan?.status === 'DONE'} onRunScan={() => startScan()} isScanning={isScanRunning} />}
        {activeTab === 'seo' && <SEOPanel data={prospect.audit_results?.SEO} scanDone={scan?.status === 'DONE'} onRunScan={() => startScan()} isScanning={isScanRunning} />}
        {activeTab === 'performance' && <PerformancePanel data={prospect.audit_results?.PERFORMANCE} scanDone={scan?.status === 'DONE'} onRunScan={() => startScan()} isScanning={isScanRunning} />}
        {activeTab === 'security' && <SecurityPanel data={prospect.audit_results?.SECURITY} scanDone={scan?.status === 'DONE'} onRunScan={() => startScan()} isScanning={isScanRunning} />}
        {activeTab === 'technology' && <TechStackPanel data={prospect.audit_results?.TECHNOLOGY} scanDone={scan?.status === 'DONE'} onRunScan={() => startScan()} isScanning={isScanRunning} />}
        {activeTab === 'marketing' && <MarketingPanel data={prospect.audit_results?.MARKETING} scanDone={scan?.status === 'DONE'} onRunScan={() => startScan()} isScanning={isScanRunning} />}
      </div>
    </div>
  );
}

function InfoRow({ icon, label, value, href, external }: { icon: React.ReactNode; label: string; value: string; href?: string; external?: boolean }) {
  const content = (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-gray-500 w-4">{icon}</span>
      <span className="text-gray-500 w-14 shrink-0">{label}</span>
      <span className={`text-gray-200 truncate ${href ? 'hover:text-indigo-400 transition-colors' : ''}`}>{value}</span>
      {external && <ExternalLink size={10} className="text-gray-600 shrink-0" />}
    </div>
  );
  return href ? <a href={href} target={external ? '_blank' : undefined} rel="noopener noreferrer">{content}</a> : <div>{content}</div>;
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-500 w-20 shrink-0">{label}</span>
      <span className="text-gray-300 capitalize">{value}</span>
    </div>
  );
}
