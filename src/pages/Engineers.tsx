import { useState } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { useAnalytics } from '../hooks/useAnalytics';
import { VirtualEngineerList } from '../components/VirtualEngineerList';
import { EngineerCardSkeleton } from '../components/Skeleton';
import type { EngineerStats } from '../types';

type SortKey = 'score' | 'totalCommits' | 'mergedPRs' | 'activeDays' | 'commitStreak';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'totalCommits', label: 'Commits' },
  { key: 'mergedPRs', label: 'Merged PRs' },
  { key: 'activeDays', label: 'Active Days' },
  { key: 'commitStreak', label: 'Streak' },
];

export function Engineers() {
  const { data, isLoading, error } = useAnalytics();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score');

  if (isLoading) {
    return (
      <div className="p-6 space-y-5">
        <div className="space-y-1"><div className="h-6 w-32 bg-slate-700 rounded animate-pulse" /><div className="h-3 w-48 bg-slate-800 rounded animate-pulse" /></div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <EngineerCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 text-slate-400">
        {error?.message ?? 'No data available. Configure Settings first.'}
      </div>
    );
  }

  const filtered = data.engineers
    .filter((e) => {
      const q = search.toLowerCase();
      return (
        e.user.login.toLowerCase().includes(q) ||
        e.user.full_name?.toLowerCase().includes(q) ||
        e.user.email?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => (b[sortKey] as number) - (a[sortKey] as number))
    .map((e, i) => ({ ...e, rank: i + 1 } as EngineerStats));

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-100">Engineers</h1>
        <p className="text-sm text-slate-500 mt-0.5">{data.engineers.length} contributors tracked</p>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or username..."
            className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-slate-500" />
          <span className="text-xs text-slate-500">Sort by:</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Virtualised grid — renders only visible cards regardless of total count */}
      <VirtualEngineerList engineers={filtered} totalEngineers={filtered.length} />
    </div>
  );
}
