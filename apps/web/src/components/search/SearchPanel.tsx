'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, MapPin, Loader2, Sliders } from 'lucide-react';
import { searchProspects, getCategories } from '@/lib/api';
import type { SearchResponse } from '@/types/prospect';

interface Props {
  onSearchComplete?: (result: SearchResponse) => void;
}

export function SearchPanel({ onSearchComplete }: Props) {
  const [address, setAddress] = useState('');
  const [radius, setRadius] = useState(5);
  const [category, setCategory] = useState('general');
  const [keyword, setKeyword] = useState('');
  const [maxResults, setMaxResults] = useState(100);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: getCategories,
  });

  const handleSearch = async () => {
    if (!address.trim()) {
      setError('Please enter a city, address, or location.');
      return;
    }
    setError('');
    setIsSearching(true);
    try {
      const result = await searchProspects({
        address: address.trim(),
        radius_km: radius,
        category,
        keyword: keyword || undefined,
        max_results: maxResults,
      });
      onSearchComplete?.(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Search failed. Make sure the API is running.';
      setError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-6 space-y-4">
      {/* Location */}
      <div>
        <label className="text-xs font-medium text-gray-400 mb-2 block">Location</label>
        <div className="relative">
          <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="City, state or address (e.g. Austin, TX)"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Category */}
        <div>
          <label className="text-xs font-medium text-gray-400 mb-2 block">Business Type</label>
          <select
            value={category}
            onChange={e => setCategory(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-gray-200 focus:outline-none focus:border-indigo-500/50 transition-colors appearance-none"
          >
            {categories?.map(c => (
              <option key={c.key} value={c.key} className="bg-gray-900">{c.label}</option>
            ))}
          </select>
        </div>

        {/* Radius */}
        <div>
          <label className="text-xs font-medium text-gray-400 mb-2 block">Radius: {radius} km</label>
          <input
            type="range"
            min={1} max={50} step={1}
            value={radius}
            onChange={e => setRadius(Number(e.target.value))}
            className="w-full mt-3 accent-indigo-500"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Keyword */}
        <div>
          <label className="text-xs font-medium text-gray-400 mb-2 block">Keyword (optional)</label>
          <input
            value={keyword}
            onChange={e => setKeyword(e.target.value)}
            placeholder="e.g. pizza, dental…"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
          />
        </div>

        {/* Max results */}
        <div>
          <label className="text-xs font-medium text-gray-400 mb-2 block">Max Results: {maxResults}</label>
          <input
            type="range"
            min={10} max={500} step={10}
            value={maxResults}
            onChange={e => setMaxResults(Number(e.target.value))}
            className="w-full mt-3 accent-indigo-500"
          />
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
          {error}
        </div>
      )}

      <button
        onClick={handleSearch}
        disabled={isSearching}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all disabled:opacity-50 pulse-glow"
      >
        {isSearching ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Searching OpenStreetMap…
          </>
        ) : (
          <>
            <Search size={16} />
            Find Prospects
          </>
        )}
      </button>
      <p className="text-center text-xs text-gray-600">
        Powered by OpenStreetMap · No API key required
      </p>
    </div>
  );
}
