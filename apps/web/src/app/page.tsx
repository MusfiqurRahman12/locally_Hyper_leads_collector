'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, MapPin, Zap, BarChart3, Shield, Globe, ArrowRight, Layers, Rocket } from 'lucide-react';
import Link from 'next/link';
import { SearchPanel } from '@/components/search/SearchPanel';
import type { SearchResponse } from '@/types/prospect';

export default function HomePage() {
  const router = useRouter();
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);

  const handleSearchComplete = (result: SearchResponse) => {
    setSearchResult(result);
    const loc = result.city || result.state || (result.location_name ? result.location_name.split(',').filter(p => isNaN(Number(p.trim())))[0]?.trim() : '');
    const searchParam = loc ? encodeURIComponent(loc) : '';
    setTimeout(() => router.push(searchParam ? `/dashboard?search=${searchParam}` : '/dashboard'), 1200);
  };

  return (
    <div className="min-h-screen hero-gradient flex flex-col">
      {/* ── Nav ── */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
            <Layers size={16} className="text-white" />
          </div>
          <span className="font-semibold text-white">Local Prospect Finder</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/bulk-scraper"
            className="text-sm text-violet-400 hover:text-violet-300 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20"
          >
            <Rocket size={13} /> Bulk Scraper
          </Link>
          <button
            onClick={() => router.push('/dashboard')}
            className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            Dashboard <ArrowRight size={14} />
          </button>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <div className="fade-up max-w-4xl w-full text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-sm mb-6">
            <Zap size={12} />
            AI-Powered Business Intelligence
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 leading-tight">
            Discover &amp; Score<br />
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              Local Business Prospects
            </span>
          </h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Find businesses in any area, audit their digital presence across 7 dimensions,
            and identify high-value sales opportunities — completely free using OpenStreetMap.
          </p>
        </div>

        {/* ── Search Panel ── */}
        <div className="w-full max-w-2xl fade-up" style={{ animationDelay: '0.1s' }}>
          <SearchPanel onSearchComplete={handleSearchComplete} />
        </div>

        {/* ── Success banner ── */}
        {searchResult && (
          <div className="mt-6 fade-up glass rounded-xl px-6 py-4 text-center">
            <p className="text-green-400 font-medium">
              ✓ Found {searchResult.total} businesses · {searchResult.prospects_created} new prospects added
            </p>
            <p className="text-gray-400 text-sm mt-1">Redirecting to dashboard…</p>
          </div>
        )}

        {/* ── Bulk Scraper CTA ── */}
        <div className="mt-8 fade-up" style={{ animationDelay: '0.15s' }}>
          <Link
            href="/bulk-scraper"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-violet-600/20 border border-violet-500/30 text-violet-300 hover:bg-violet-600/30 hover:text-violet-200 transition-all text-sm font-medium group"
          >
            <Rocket size={15} className="group-hover:animate-bounce" />
            Have many keywords? Use the Bulk Keyword Scraper
            <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
          </Link>
        </div>

        {/* ── Feature grid ── */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl w-full fade-up" style={{ animationDelay: '0.2s' }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="glass rounded-xl p-4 text-left hover:bg-white/5 transition-colors">
              <div className="w-8 h-8 rounded-lg mb-3 flex items-center justify-center" style={{ background: f.bg }}>
                <f.icon size={16} style={{ color: f.color }} />
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">{f.title}</h3>
              <p className="text-xs text-gray-500">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  { icon: Globe, title: 'Free Discovery', desc: 'OpenStreetMap Overpass API — no API key needed', bg: 'rgba(16,185,129,0.15)', color: '#10b981' },
  { icon: BarChart3, title: 'SEO Audit', desc: 'Title, meta, H1, schema, sitemap & more', bg: 'rgba(99,102,241,0.15)', color: '#818cf8' },
  { icon: Zap, title: 'Performance', desc: 'Core Web Vitals via PageSpeed Insights API', bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
  { icon: Shield, title: 'Security Check', desc: 'SSL, headers, HTTPS & exposed paths', bg: 'rgba(239,68,68,0.15)', color: '#f87171' },
  { icon: Search, title: 'Tech Detection', desc: 'CMS, analytics, pixels & frameworks', bg: 'rgba(139,92,246,0.15)', color: '#a78bfa' },
  { icon: MapPin, title: 'Lead Scoring', desc: '0–100 opportunity score with priority', bg: 'rgba(59,130,246,0.15)', color: '#60a5fa' },
];
