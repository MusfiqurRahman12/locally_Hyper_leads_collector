'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Loader2, Play, Square, Download, CheckCircle2, XCircle,
  Clock, Zap, SkipForward, Trash2, FileSpreadsheet, FileText,
  AlertTriangle, ChevronDown, ChevronUp, RotateCcw, Radar,
} from 'lucide-react';
import { searchProspects, getExportUrl } from '@/lib/api';
import type { SearchResponse } from '@/types/prospect';

/* ────────────────────────── types ────────────────────────── */

type KeywordStatus = 'pending' | 'running' | 'done' | 'failed' | 'skipped';

interface KeywordResult {
  keyword: string;
  status: KeywordStatus;
  result?: SearchResponse;
  error?: string;
  startedAt?: number;
  finishedAt?: number;
}

interface Props {
  onAllComplete?: (results: KeywordResult[]) => void;
}

/* ───────────────────── helper: parse keywords ───────────────────── */

function parseKeywords(raw: string): string[] {
  // Split by newline OR comma, trim, remove empties & dupes
  return [...new Set(
    raw
      .split(/[\n,]+/)
      .map(k => k.trim())
      .filter(Boolean)
  )];
}

/* ───────────── helper: split keyword into location + trade ─────────────
 *  "finish carpentry Birmingham AL"  →  { address: "Birmingham AL", keyword: "finish carpentry" }
 *  "plumber in Mobile AL"            →  { address: "Mobile AL",      keyword: "plumber" }
 *  "Birmingham AL"                   →  { address: "Birmingham AL",  keyword: undefined }
 *
 *  Strategy: US state abbreviations are 2 uppercase letters at the end.
 *  We look for known patterns: "CITY STATE" at the end, and everything
 *  before that is the keyword/trade term. The word "in" is stripped.
 */

const US_STATES = new Set([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY','DC',
]);

function splitKeywordAndLocation(raw: string): { address: string; keyword?: string } {
  const trimmed = raw.trim();
  const words = trimmed.split(/\s+/);

  // Try to find a state abbreviation at the end
  if (words.length >= 2) {
    const lastWord = words[words.length - 1].toUpperCase().replace(/[.,;]+$/, '');

    if (US_STATES.has(lastWord)) {
      // Walk backwards to find where the city starts
      // City is typically 1-3 words before the state
      // We try city lengths of 1, 2, 3 words and pick the best
      for (let cityWords = 1; cityWords <= Math.min(3, words.length - 1); cityWords++) {
        const cityStart = words.length - 1 - cityWords;
        const locationParts = words.slice(cityStart);
        const keywordParts = words.slice(0, cityStart);

        // Remove "in" / "near" connector words from keyword tail
        while (
          keywordParts.length > 0 &&
          ['in', 'near', 'around', 'at', 'for'].includes(keywordParts[keywordParts.length - 1].toLowerCase())
        ) {
          keywordParts.pop();
        }

        // If we found keyword parts, this split makes sense
        if (keywordParts.length > 0) {
          return {
            address: locationParts.join(' '),
            keyword: keywordParts.join(' '),
          };
        }
      }

      // Only location, no keyword (e.g. "Birmingham AL")
      return { address: trimmed };
    }
  }

  // No state abbreviation found — treat entire string as address
  // (Nominatim will try to geocode it)
  return { address: trimmed };
}

/* ────────────────────── delay utility ────────────────────── */

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

/* ════════════════════════════════════════════════════════════════════
   COMPONENT
   ════════════════════════════════════════════════════════════════════ */

export function BulkScraperPanel({ onAllComplete }: Props) {
  /* ── state ── */
  const [rawInput, setRawInput] = useState('');
  const [keywords, setKeywords] = useState<KeywordResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const [showCompleted, setShowCompleted] = useState(true);
  const [autoDownload, setAutoDownload] = useState(true);
  const [delayBetween, setDelayBetween] = useState(2); // seconds between requests
  const [radius, setRadius] = useState(15);
  const [category, setCategory] = useState('general');
  const [maxResults, setMaxResults] = useState(100);
  const [exportFormat, setExportFormat] = useState<'excel' | 'csv'>('excel');
  const [currentKeywordLabel, setCurrentKeywordLabel] = useState('');
  const [livePhase, setLivePhase] = useState<'geocoding' | 'searching' | 'saving' | ''>('');

  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  /* Keep a ref copy of keywords so the loop always reads the latest list */
  const keywordsRef = useRef<KeywordResult[]>([]);
  useEffect(() => { keywordsRef.current = keywords; }, [keywords]);

  /* ── derived stats ── */
  const totalKeywords = keywords.length;
  const completed = keywords.filter(k => k.status === 'done').length;
  const failed = keywords.filter(k => k.status === 'failed').length;
  const skipped = keywords.filter(k => k.status === 'skipped').length;
  const totalProspects = keywords.reduce((s, k) => s + (k.result?.total ?? 0), 0);
  const totalCreated = keywords.reduce((s, k) => s + (k.result?.prospects_created ?? 0), 0);
  const processed = completed + failed + skipped;
  const progressPct = totalKeywords > 0
    ? Math.round((processed / totalKeywords) * 100)
    : 0;

  /* ── elapsed time + ETA ── */
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef<number>(0);
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isRunning && !isPaused) {
      timer = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRunning, isPaused]);

  const formatTime = (s: number) => {
    if (s < 0) return '—';
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${m}m ${sec.toString().padStart(2, '0')}s`;
    return `${m}m ${sec.toString().padStart(2, '0')}s`;
  };

  const avgTimePerKeyword = processed > 0 ? elapsed / processed : 0;
  const remaining = totalKeywords - processed;
  const etaSeconds = processed > 0 ? Math.round(avgTimePerKeyword * remaining) : -1;

  /* ── auto-scroll to active keyword ── */
  useEffect(() => {
    if (scrollRef.current && currentIdx >= 0) {
      const el = scrollRef.current.children[currentIdx] as HTMLElement;
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentIdx]);

  /* ────────────────────── LOAD keywords ────────────────────── */
  const handleLoadKeywords = () => {
    const parsed = parseKeywords(rawInput);
    if (parsed.length === 0) return;
    setKeywords(parsed.map(k => ({ keyword: k, status: 'pending' as const })));
    setCurrentIdx(-1);
  };

  /* ────────────────────── RUN engine ────────────────────── */
  const handleStart = useCallback(async () => {
    cancelRef.current = false;
    pauseRef.current = false;
    setIsRunning(true);
    setIsPaused(false);
    if (startTimeRef.current === 0) startTimeRef.current = Date.now();

    // Read from ref to get latest keyword list
    const kws = keywordsRef.current;
    const startFrom = kws.findIndex(k => k.status === 'pending');
    if (startFrom === -1) {
      setIsRunning(false);
      return;
    }

    for (let i = startFrom; i < kws.length; i++) {
      // Check cancellation
      if (cancelRef.current) break;

      // Pause loop
      while (pauseRef.current) {
        await delay(200);
        if (cancelRef.current) break;
      }
      if (cancelRef.current) break;

      // Re-read ref in case user retried or modified
      const current = keywordsRef.current[i];
      if (!current || current.status === 'done' || current.status === 'skipped') continue;

      setCurrentIdx(i);
      setCurrentKeywordLabel(current.keyword);

      // Mark as running
      setKeywords(prev => {
        const next = [...prev];
        next[i] = { ...next[i], status: 'running', startedAt: Date.now() };
        return next;
      });

      try {
        // Smart split: extract location and keyword from the search string
        const { address, keyword: tradeKeyword } = splitKeywordAndLocation(current.keyword);

        setLivePhase('geocoding');

        // Small visual delay so user sees geocoding phase
        await delay(100);

        setLivePhase('searching');

        const result = await searchProspects({
          address,
          radius_km: radius,
          category,
          keyword: tradeKeyword || undefined,
          max_results: maxResults,
        });

        setLivePhase('saving');
        await delay(200); // brief "saving" flash

        setKeywords(prev => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: 'done',
            result,
            finishedAt: Date.now(),
          };
          return next;
        });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Unknown error';
        setKeywords(prev => {
          const next = [...prev];
          next[i] = {
            ...next[i],
            status: 'failed',
            error: msg,
            finishedAt: Date.now(),
          };
          return next;
        });
      }

      setLivePhase('');

      // Delay between requests (rate limiting)
      if (i < kws.length - 1 && !cancelRef.current) {
        await delay(delayBetween * 1000);
      }
    }

    setIsRunning(false);
    setCurrentIdx(-1);
    setCurrentKeywordLabel('');
    setLivePhase('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radius, category, maxResults, delayBetween]);

  /* ── auto-download after completion ── */
  useEffect(() => {
    if (
      !isRunning &&
      totalKeywords > 0 &&
      processed === totalKeywords &&
      autoDownload &&
      completed > 0
    ) {
      // Small delay so UI can update
      const timer = setTimeout(() => {
        const url = getExportUrl(exportFormat);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prospects_bulk_${new Date().toISOString().slice(0, 10)}.${exportFormat === 'excel' ? 'xlsx' : 'csv'}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }, 1500);
      onAllComplete?.(keywords);
      return () => clearTimeout(timer);
    }
  }, [isRunning, totalKeywords, completed, processed, autoDownload, exportFormat, keywords, onAllComplete]);

  const handlePause = () => {
    pauseRef.current = !pauseRef.current;
    setIsPaused(!isPaused);
  };

  const handleStop = () => {
    cancelRef.current = true;
    pauseRef.current = false;
    setIsPaused(false);

    // Mark remaining as skipped
    setKeywords(prev =>
      prev.map(k =>
        k.status === 'pending' || k.status === 'running'
          ? { ...k, status: 'skipped' as const }
          : k
      )
    );
    setIsRunning(false);
    setCurrentIdx(-1);
    setCurrentKeywordLabel('');
    setLivePhase('');
  };

  const handleReset = () => {
    setKeywords([]);
    setCurrentIdx(-1);
    setIsRunning(false);
    setIsPaused(false);
    setElapsed(0);
    startTimeRef.current = 0;
    cancelRef.current = false;
    pauseRef.current = false;
    setCurrentKeywordLabel('');
    setLivePhase('');
  };

  const handleRetryFailed = () => {
    setKeywords(prev =>
      prev.map(k =>
        k.status === 'failed' ? { ...k, status: 'pending' as const, error: undefined } : k
      )
    );
  };

  const handleManualDownload = () => {
    const url = getExportUrl(exportFormat);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prospects_bulk_${new Date().toISOString().slice(0, 10)}.${exportFormat === 'excel' ? 'xlsx' : 'csv'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const isAllDone = totalKeywords > 0 && !isRunning && processed === totalKeywords;
  const hasPending = keywords.some(k => k.status === 'pending');

  /* ═══════════════════════════════ RENDER ═══════════════════════════════ */
  return (
    <div className="space-y-6">

      {/* ─────────── INPUT AREA ─────────── */}
      {keywords.length === 0 && (
        <div className="glass rounded-2xl p-6 space-y-4 fade-up">
          <div>
            <label className="text-xs font-medium text-gray-400 mb-2 block">
              Paste your search keywords — one per line or comma-separated
            </label>
            <textarea
              value={rawInput}
              onChange={e => setRawInput(e.target.value)}
              rows={12}
              placeholder={`finish carpentry Birmingham AL, trim carpenter Birmingham AL\ncustom woodworker Huntsville AL\ndrywall repair Montgomery AL\ndeck builder Mobile AL\nplumber in Tuscaloosa AL\n...`}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 transition-colors font-mono resize-y min-h-[200px]"
            />
            <p className="text-xs text-gray-600 mt-1">
              {parseKeywords(rawInput).length} keywords detected · duplicates auto-removed ·
              <span className="text-indigo-400/70"> auto-splits &ldquo;trade + city STATE&rdquo; into separate fields</span>
            </p>
          </div>

          {/* ── Settings Row ── */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1 block">Category</label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-indigo-500/50 transition-colors appearance-none"
              >
                <option value="general" className="bg-gray-900">General</option>
                <option value="restaurants" className="bg-gray-900">Restaurants</option>
                <option value="construction" className="bg-gray-900">Construction</option>
                <option value="plumbing" className="bg-gray-900">Plumbing</option>
                <option value="electricians" className="bg-gray-900">Electricians</option>
                <option value="roofing" className="bg-gray-900">Roofing</option>
                <option value="hvac" className="bg-gray-900">HVAC</option>
                <option value="salons" className="bg-gray-900">Salons / Beauty</option>
                <option value="auto_repair" className="bg-gray-900">Auto Repair</option>
                <option value="medical_clinics" className="bg-gray-900">Medical / Clinics</option>
                <option value="dentists" className="bg-gray-900">Dentists</option>
                <option value="law_firms" className="bg-gray-900">Law Firms</option>
                <option value="real_estate" className="bg-gray-900">Real Estate</option>
                <option value="hotels" className="bg-gray-900">Hotels</option>
                <option value="gyms" className="bg-gray-900">Gyms / Fitness</option>
                <option value="accounting" className="bg-gray-900">Accounting</option>
                <option value="insurance" className="bg-gray-900">Insurance</option>
                <option value="veterinary" className="bg-gray-900">Veterinary</option>
                <option value="pharmacies" className="bg-gray-900">Pharmacies</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1 block">Radius: {radius} km</label>
              <input
                type="range" min={1} max={50} step={1}
                value={radius}
                onChange={e => setRadius(Number(e.target.value))}
                className="w-full mt-2 accent-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1 block">Max Results: {maxResults}</label>
              <input
                type="range" min={10} max={500} step={10}
                value={maxResults}
                onChange={e => setMaxResults(Number(e.target.value))}
                className="w-full mt-2 accent-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-400 mb-1 block">Delay: {delayBetween}s</label>
              <input
                type="range" min={0} max={10} step={0.5}
                value={delayBetween}
                onChange={e => setDelayBetween(Number(e.target.value))}
                className="w-full mt-2 accent-indigo-500"
              />
            </div>
          </div>

          {/* ── Auto-download & Format ── */}
          <div className="flex items-center gap-4 pt-2">
            <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer">
              <input
                type="checkbox"
                checked={autoDownload}
                onChange={e => setAutoDownload(e.target.checked)}
                className="accent-indigo-500"
              />
              Auto-download when done
            </label>
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-gray-500">Export as:</span>
              <button
                onClick={() => setExportFormat('excel')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  exportFormat === 'excel'
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-gray-500 hover:text-white border border-white/10 hover:border-white/20'
                }`}
              >
                <FileSpreadsheet size={12} /> Excel
              </button>
              <button
                onClick={() => setExportFormat('csv')}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  exportFormat === 'csv'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'text-gray-500 hover:text-white border border-white/10 hover:border-white/20'
                }`}
              >
                <FileText size={12} /> CSV
              </button>
            </div>
          </div>

          {/* ── Load Button ── */}
          <button
            onClick={handleLoadKeywords}
            disabled={parseKeywords(rawInput).length === 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed pulse-glow"
          >
            <Zap size={16} />
            Load {parseKeywords(rawInput).length} Keywords
          </button>
        </div>
      )}

      {/* ─────────── CONTROL PANEL (when keywords loaded) ─────────── */}
      {keywords.length > 0 && (
        <>
          {/* ═══════ LIVE STATUS BANNER ═══════ */}
          {isRunning && currentIdx >= 0 && (
            <div className="glass rounded-2xl p-5 fade-up border border-indigo-500/20 relative overflow-hidden">
              {/* Animated background pulse */}
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 via-violet-500/10 to-indigo-500/5 animate-pulse" />

              <div className="relative flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                  <Radar size={22} className="text-indigo-400 animate-spin" style={{ animationDuration: '3s' }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-indigo-400/70">
                      {currentIdx + 1} / {totalKeywords}
                    </span>
                    <span className="text-xs text-gray-600">·</span>
                    <span className="text-xs text-gray-500">
                      {livePhase === 'geocoding' && '📍 Geocoding location…'}
                      {livePhase === 'searching' && '🔍 Querying OpenStreetMap…'}
                      {livePhase === 'saving' && '💾 Saving prospects…'}
                      {!livePhase && '⏳ Preparing…'}
                    </span>
                  </div>

                  <p className="text-white font-semibold text-lg truncate">
                    {currentKeywordLabel}
                  </p>

                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-gray-500">
                      Elapsed: <span className="text-gray-300">{formatTime(elapsed)}</span>
                    </span>
                    {etaSeconds > 0 && (
                      <span className="text-xs text-gray-500">
                        ETA: <span className="text-amber-400">{formatTime(etaSeconds)}</span>
                      </span>
                    )}
                    {avgTimePerKeyword > 0 && (
                      <span className="text-xs text-gray-500">
                        Avg: <span className="text-gray-300">{avgTimePerKeyword.toFixed(1)}s</span>/keyword
                      </span>
                    )}
                  </div>
                </div>

                {/* Mini progress ring */}
                <div className="flex-shrink-0 text-center">
                  <div className="relative w-14 h-14">
                    <svg className="w-14 h-14 -rotate-90" viewBox="0 0 56 56">
                      <circle cx="28" cy="28" r="24" stroke="rgba(255,255,255,0.05)" strokeWidth="4" fill="none" />
                      <circle
                        cx="28" cy="28" r="24"
                        stroke="#6366f1"
                        strokeWidth="4"
                        fill="none"
                        strokeDasharray={`${2 * Math.PI * 24}`}
                        strokeDashoffset={`${2 * Math.PI * 24 * (1 - progressPct / 100)}`}
                        strokeLinecap="round"
                        className="transition-all duration-700"
                      />
                    </svg>
                    <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-indigo-400">
                      {progressPct}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════ PAUSED BANNER ═══════ */}
          {isRunning && isPaused && (
            <div className="glass rounded-2xl p-4 border border-amber-500/20 flex items-center gap-3 fade-up">
              <Clock size={18} className="text-amber-400" />
              <span className="text-amber-400 font-medium text-sm">Paused</span>
              <span className="text-gray-500 text-xs">— click Resume to continue</span>
            </div>
          )}

          {/* ── Stats Bar ── */}
          <div className="glass rounded-2xl p-5 fade-up">
            {/* Progress bar */}
            <div className="h-2.5 bg-white/5 rounded-full overflow-hidden mb-4">
              <div
                className="h-full progress-bar rounded-full transition-all duration-700"
                style={{ width: `${progressPct}%` }}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <StatCard label="Total Keywords" value={totalKeywords} color="text-white" />
              <StatCard label="Completed" value={completed} color="text-emerald-400" />
              <StatCard label="Failed" value={failed} color="text-red-400" />
              <StatCard label="Prospects Found" value={totalProspects} color="text-indigo-400" />
              <StatCard label="New Created" value={totalCreated} color="text-violet-400" />
              <StatCard label="Elapsed" value={formatTime(elapsed)} color="text-amber-400" isText />
            </div>

            {/* ── Control Buttons ── */}
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-white/5">
              {!isRunning && hasPending && (
                <button
                  onClick={handleStart}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-all text-sm"
                >
                  <Play size={14} />
                  {completed > 0 ? 'Resume' : 'Start Scraping'}
                </button>
              )}

              {isRunning && (
                <>
                  <button
                    onClick={handlePause}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all text-sm ${
                      isPaused
                        ? 'bg-amber-600 hover:bg-amber-500 text-white'
                        : 'bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30'
                    }`}
                  >
                    {isPaused ? (
                      <><Play size={14} /> Resume</>
                    ) : (
                      <><Clock size={14} /> Pause</>
                    )}
                  </button>
                  <button
                    onClick={handleStop}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 font-medium transition-all text-sm"
                  >
                    <Square size={14} /> Stop
                  </button>
                </>
              )}

              {!isRunning && failed > 0 && (
                <button
                  onClick={handleRetryFailed}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 hover:bg-amber-500/30 font-medium transition-all text-sm"
                >
                  <RotateCcw size={14} /> Retry {failed} Failed
                </button>
              )}

              <div className="ml-auto flex items-center gap-2">
                {(isAllDone || completed > 0) && (
                  <button
                    onClick={handleManualDownload}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all text-sm"
                  >
                    <Download size={14} />
                    Download {exportFormat === 'excel' ? 'Excel' : 'CSV'}
                  </button>
                )}
                <button
                  onClick={handleReset}
                  disabled={isRunning}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 font-medium transition-all text-sm disabled:opacity-30"
                >
                  <Trash2 size={14} /> Reset
                </button>
              </div>
            </div>

            {/* Completion message */}
            {isAllDone && completed > 0 && (
              <div className="mt-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center fade-up">
                <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-400" />
                <p className="text-emerald-400 font-medium">
                  Scraping Complete! {totalCreated} new prospects from {completed} keywords
                </p>
                {autoDownload && (
                  <p className="text-emerald-400/60 text-xs mt-1">
                    Auto-downloading {exportFormat === 'excel' ? 'Excel' : 'CSV'} file…
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ── Keyword List ── */}
          <div className="glass rounded-2xl overflow-hidden fade-up">
            <div className="flex items-center justify-between px-5 py-3 border-b border-white/5">
              <h3 className="text-sm font-semibold text-white">Keyword Queue</h3>
              <button
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-white transition-colors"
              >
                {showCompleted ? 'Hide' : 'Show'} completed
                {showCompleted ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            </div>

            <div ref={scrollRef} className="max-h-[500px] overflow-y-auto divide-y divide-white/5">
              {keywords.map((k, i) => {
                // Hide completed if toggled off
                if (!showCompleted && (k.status === 'done' || k.status === 'skipped')) return null;

                // Parse the keyword for display
                const parsed = splitKeywordAndLocation(k.keyword);

                return (
                  <div
                    key={`${k.keyword}-${i}`}
                    className={`flex items-center gap-3 px-5 py-3 transition-all ${
                      k.status === 'running'
                        ? 'bg-indigo-500/10 border-l-2 border-l-indigo-500'
                        : k.status === 'done'
                          ? 'bg-emerald-500/5'
                          : k.status === 'failed'
                            ? 'bg-red-500/5'
                            : ''
                    }`}
                  >
                    {/* Status icon */}
                    <div className="w-6 flex-shrink-0">
                      {k.status === 'pending' && (
                        <Clock size={14} className="text-gray-600" />
                      )}
                      {k.status === 'running' && (
                        <Loader2 size={14} className="text-indigo-400 animate-spin" />
                      )}
                      {k.status === 'done' && (
                        <CheckCircle2 size={14} className="text-emerald-400" />
                      )}
                      {k.status === 'failed' && (
                        <XCircle size={14} className="text-red-400" />
                      )}
                      {k.status === 'skipped' && (
                        <SkipForward size={14} className="text-gray-500" />
                      )}
                    </div>

                    {/* Index */}
                    <span className="text-xs text-gray-600 w-8 flex-shrink-0 font-mono">
                      {String(i + 1).padStart(3, '0')}
                    </span>

                    {/* Keyword — show parsed split */}
                    <div className={`flex-1 min-w-0 ${
                      k.status === 'running'
                        ? 'text-indigo-300'
                        : k.status === 'done'
                          ? 'text-gray-400'
                          : k.status === 'failed'
                            ? 'text-red-300'
                            : 'text-gray-300'
                    }`}>
                      <span className="text-sm font-mono truncate block">
                        {k.keyword}
                      </span>
                      {parsed.keyword && (
                        <span className="text-xs text-gray-600 block mt-0.5">
                          📍 {parsed.address} · 🔑 {parsed.keyword}
                        </span>
                      )}
                    </div>

                    {/* Result or error */}
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {k.status === 'done' && k.result && (
                        <>
                          <span className="text-xs text-emerald-400/80">
                            {k.result.total} found
                          </span>
                          <span className="text-xs text-violet-400/80">
                            +{k.result.prospects_created} new
                          </span>
                        </>
                      )}
                      {k.status === 'failed' && k.error && (
                        <span className="text-xs text-red-400/80 max-w-[200px] truncate flex items-center gap-1">
                          <AlertTriangle size={10} />
                          {k.error}
                        </span>
                      )}
                      {k.status === 'running' && (
                        <span className="text-xs text-indigo-400/80 animate-pulse">
                          Searching…
                        </span>
                      )}
                      {k.finishedAt && k.startedAt && (
                        <span className="text-xs text-gray-600">
                          {((k.finishedAt - k.startedAt) / 1000).toFixed(1)}s
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ────────────────────── stat card sub-component ────────────────────── */

function StatCard({
  label,
  value,
  color,
  isText = false,
}: {
  label: string;
  value: string | number;
  color: string;
  isText?: boolean;
}) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold ${color} ${!isText ? 'font-mono' : ''}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}
