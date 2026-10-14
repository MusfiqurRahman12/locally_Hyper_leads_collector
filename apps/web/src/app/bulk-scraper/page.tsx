'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Layers, Zap, Rocket, ListChecks, Download } from 'lucide-react';
import { BulkScraperPanel } from '@/components/search/BulkScraperPanel';
import Link from 'next/link';

export default function BulkScraperPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen hero-gradient flex flex-col">
      {/* ── Nav ── */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-gray-950/60 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center">
              <Layers size={16} className="text-white" />
            </div>
            <span className="font-semibold text-white">Local Prospect Finder</span>
          </div>
          <span className="text-gray-600">·</span>
          <span className="text-indigo-400 text-sm font-medium">Bulk Keyword Scraper</span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard"
            className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1"
          >
            Dashboard →
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <div className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="fade-up max-w-4xl w-full text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 text-violet-400 text-sm mb-4">
            <Rocket size={12} />
            Hyper-Optimized Batch Scraping
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 leading-tight">
            Bulk Keyword{' '}
            <span className="bg-gradient-to-r from-indigo-400 to-violet-400 bg-clip-text text-transparent">
              Scraper
            </span>
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto text-sm leading-relaxed">
            Paste all your search keywords — comma or line separated. The engine processes each keyword
            sequentially, scrapes businesses from OpenStreetMap, and auto-downloads your leads file when done.
          </p>
        </div>

        {/* ── How it works ── */}
        <div className="max-w-4xl w-full mb-8 fade-up" style={{ animationDelay: '0.05s' }}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <StepCard
              step={1}
              icon={ListChecks}
              title="Paste Keywords"
              desc="Comma or line separated. Duplicates auto-removed."
            />
            <StepCard
              step={2}
              icon={Zap}
              title="Auto-Scrape"
              desc="Each keyword is searched sequentially with live progress."
            />
            <StepCard
              step={3}
              icon={Download}
              title="Auto-Download"
              desc="Excel or CSV file auto-downloads when scraping completes."
            />
          </div>
        </div>

        {/* ── Bulk Scraper Panel ── */}
        <div className="w-full max-w-4xl fade-up" style={{ animationDelay: '0.1s' }}>
          <BulkScraperPanel />
        </div>
      </div>
    </div>
  );
}

/* ── Step Card ── */
function StepCard({
  step,
  icon: Icon,
  title,
  desc,
}: {
  step: number;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="glass rounded-xl p-4 flex items-start gap-3 hover:bg-white/5 transition-colors">
      <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-indigo-400" />
      </div>
      <div>
        <p className="text-xs text-indigo-400/60 font-mono mb-0.5">Step {step}</p>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}
