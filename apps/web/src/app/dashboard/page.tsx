'use client';
import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Search, Filter, Download, RefreshCw, Zap, Globe, MapPin,
  ChevronUp, ChevronDown, Trash2, ScanLine, LayoutGrid, List,
  ArrowLeft, Rocket
} from 'lucide-react';
import { listProspects, triggerBulkScan, getExportUrl } from '@/lib/api';
import { ScoreBadge } from '@/components/prospects/ScoreBadge';
import { PriorityBadge } from '@/components/prospects/PriorityBadge';
import { ProspectMap } from '@/components/map/ProspectMap';
import type { Prospect, SortField, SortDir, PriorityFilter } from '@/types/prospect';
import Link from 'next/link';

export default function DashboardPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const q = params.get('search');
      if (q) setSearch(q);
    }
  }, []);

  const [category, setCategory] = useState('');
  const [priority, setPriority] = useState<PriorityFilter>('');
  const [hasWebsite, setHasWebsite] = useState<boolean | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortField>('lead_score');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [view, setView] = useState<'table' | 'map'>('table');
  const [bulkScanStatus, setBulkScanStatus] = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['prospects', search, category, priority, hasWebsite, page, sortBy, sortDir],
    queryFn: () => listProspects({
      search: search || undefined,
      category: category || undefined,
      priority: priority || undefined,
      has_website: hasWebsite,
      page,
      page_size: 50,
      sort_by: sortBy,
      sort_dir: sortDir,
    }),
    refetchInterval: 15000,
  });

  const prospects = data?.prospects ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const toggleSort = (field: SortField) => {
    if (sortBy === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === prospects.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(prospects.map(p => p.id)));
    }
  };

  const handleBulkScan = async () => {
    if (selected.size === 0) return;
    setBulkScanStatus(`Queuing ${selected.size} scans…`);
    await triggerBulkScan(Array.from(selected));
    setBulkScanStatus(`${selected.size} scans queued!`);
    setSelected(new Set());
    setTimeout(() => setBulkScanStatus(''), 3000);
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortBy !== field) return <ChevronUp size={12} className="text-gray-600" />;
    return sortDir === 'asc' ? <ChevronUp size={12} className="text-indigo-400" /> : <ChevronDown size={12} className="text-indigo-400" />;
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Top Bar ── */}
      <div className="border-b border-white/5 px-6 py-3 flex items-center gap-4 bg-gray-950/80 backdrop-blur sticky top-0 z-10">
        <Link href="/" className="text-gray-500 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-indigo-500 flex items-center justify-center">
            <Zap size={12} className="text-white" />
          </div>
          <span className="font-semibold text-sm text-white">Local Prospect Finder</span>
        </div>
        <span className="text-gray-600 text-xs">·</span>
        <span className="text-gray-400 text-sm">{total.toLocaleString()} prospects</span>

        <div className="ml-auto flex items-center gap-2">
          {bulkScanStatus && (
            <span className="text-xs text-indigo-400 animate-pulse">{bulkScanStatus}</span>
          )}
          {selected.size > 0 && (
            <button
              onClick={handleBulkScan}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors"
            >
              <ScanLine size={12} /> Scan {selected.size} selected
            </button>
          )}
          <a
            href={getExportUrl('csv', priority || undefined)}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-gray-300 text-xs transition-colors"
          >
            <Download size={12} /> Export CSV
          </a>
          <a
            href={getExportUrl('excel', priority || undefined)}
            download
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 hover:border-white/20 text-gray-300 text-xs transition-colors"
          >
            <Download size={12} /> Excel
          </a>
          <button onClick={() => refetch()} className="p-1.5 rounded-lg border border-white/10 hover:border-white/20 text-gray-400 transition-colors">
            <RefreshCw size={14} />
          </button>
          <Link href="/bulk-scraper" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600/20 border border-violet-500/30 text-violet-400 text-xs hover:bg-violet-600/30 transition-colors">
            <Rocket size={12} /> Bulk Scraper
          </Link>
          <Link href="/" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 text-xs hover:bg-indigo-600/30 transition-colors">
            <Search size={12} /> New Search
          </Link>
          {/* View toggle */}
          <div className="flex items-center gap-1 p-1 rounded-lg border border-white/10">
            <button onClick={() => setView('table')} className={`p-1 rounded-md transition-colors ${view === 'table' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-white'}`}>
              <List size={13} />
            </button>
            <button onClick={() => setView('map')} className={`p-1 rounded-md transition-colors ${view === 'map' ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-white'}`}>
              <MapPin size={13} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar Filters ── */}
        <aside className="w-52 shrink-0 border-r border-white/5 p-4 flex flex-col gap-4 bg-gray-950/50">
          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">Search</label>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Business name, city, state…"
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-7 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">Priority</label>
            <div className="flex flex-col gap-1">
              {(['', 'HIGH', 'MEDIUM', 'LOW'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => { setPriority(p); setPage(1); }}
                  className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${priority === p ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  {p || 'All Priorities'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">Website</label>
            <div className="flex flex-col gap-1">
              {[
                { label: 'Any', val: undefined },
                { label: 'Has Website', val: true },
                { label: 'No Website', val: false },
              ].map(opt => (
                <button
                  key={String(opt.val)}
                  onClick={() => { setHasWebsite(opt.val); setPage(1); }}
                  className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${hasWebsite === opt.val ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 block">Category</label>
            <input
              value={category}
              onChange={e => { setCategory(e.target.value); setPage(1); }}
              placeholder="e.g. restaurant…"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 overflow-auto">
          {view === 'map' ? (
            <div className="p-4 h-full">
              <ProspectMap prospects={prospects} />
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/5 bg-gray-950/50">
                      <th className="px-4 py-3 text-left w-8">
                        <input
                          type="checkbox"
                          checked={selected.size === prospects.length && prospects.length > 0}
                          onChange={selectAll}
                          className="accent-indigo-500"
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Business</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
                        <button onClick={() => toggleSort('review_count')} className="flex items-center gap-1 hover:text-white transition-colors">
                          Reviews <SortIcon field="review_count" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        <button onClick={() => toggleSort('lead_score')} className="flex items-center gap-1 hover:text-white transition-colors">
                          Score <SortIcon field="lead_score" />
                        </button>
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden xl:table-cell">Website</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 10 }).map((_, i) => (
                        <tr key={i} className="border-b border-white/5 animate-pulse">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="h-4 bg-white/5 rounded w-full" />
                          </td>
                        </tr>
                      ))
                    ) : prospects.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-16 text-center text-gray-500">
                          <Globe size={32} className="mx-auto mb-3 opacity-30" />
                          <p className="text-sm">No prospects found.</p>
                          <p className="text-xs mt-1">
                            <Link href="/" className="text-indigo-400 hover:underline">Run a search</Link> to discover businesses.
                          </p>
                        </td>
                      </tr>
                    ) : prospects.map(p => (
                      <tr
                        key={p.id}
                        className="border-b border-white/5 prospect-row group"
                        onClick={() => router.push(`/prospect/${p.id}`)}
                      >
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            className="accent-indigo-500"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-white text-sm group-hover:text-indigo-300 transition-colors">{p.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{p.category || '—'}</div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="text-xs text-gray-400">{[p.city, p.state].filter(Boolean).join(', ') || '—'}</div>
                        </td>
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <div className="text-xs text-gray-400">
                            {p.google_rating ? `★ ${p.google_rating} (${p.review_count})` : '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <ScoreBadge score={p.lead_score} />
                        </td>
                        <td className="px-4 py-3">
                          {p.priority ? <PriorityBadge priority={p.priority} /> : <span className="text-gray-600 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3 hidden xl:table-cell">
                          {p.website ? (
                            <a
                              href={p.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={e => e.stopPropagation()}
                              className="text-xs text-indigo-400 hover:underline truncate max-w-[160px] block"
                            >
                              {p.website.replace(/^https?:\/\//, '')}
                            </a>
                          ) : (
                            <span className="text-xs text-red-400/70">No website</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => router.push(`/prospect/${p.id}`)}
                            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors px-2 py-1 rounded-md hover:bg-indigo-500/10"
                          >
                            View →
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-white/5">
                  <span className="text-xs text-gray-500">
                    Page {page} of {totalPages} · {total} total
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 disabled:opacity-30 hover:border-white/20 transition-colors"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-gray-400 disabled:opacity-30 hover:border-white/20 transition-colors"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
