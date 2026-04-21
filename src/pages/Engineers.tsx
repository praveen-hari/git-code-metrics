import { useState } from 'react';
import {
  Search, SlidersHorizontal, ChevronDown, ChevronRight,
  GitMerge, GitPullRequest, GitCommit, Flame, ExternalLink,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow, parseISO, differenceInHours } from 'date-fns';
import { useAnalytics } from '../hooks/useAnalytics';
import { EngineerCardSkeleton } from '../components/Skeleton';
import { loadSettings } from '../store/settings';
import { classifyPR, formatMergeTime } from '../utils/scoring';
import type { EngineerStats, EngineerPREntry } from '../types';
import { PR_TYPE_COLORS } from '../types';

type SortKey = 'score' | 'totalCommits' | 'mergedPRs' | 'activeDays' | 'commitStreak';
type PRFilter = 'all' | 'merged' | 'open' | 'closed';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'score',        label: 'Score' },
  { key: 'totalCommits', label: 'Commits' },
  { key: 'mergedPRs',    label: 'Merged PRs' },
  { key: 'activeDays',   label: 'Active Days' },
  { key: 'commitStreak', label: 'Streak' },
];

// ── PR Table ──────────────────────────────────────────────────────────────────
function PRTable({ entries = [], giteaUrl }: { entries?: EngineerPREntry[]; giteaUrl: string }) {
  const [filter, setFilter] = useState<PRFilter>('all');

  const merged = entries.filter((e) => e.pr.merged);
  const open   = entries.filter((e) => !e.pr.merged && e.pr.state === 'open');
  const closed = entries.filter((e) => !e.pr.merged && e.pr.state === 'closed');

  const visible = filter === 'all'   ? [...merged, ...open, ...closed]
                : filter === 'merged' ? merged
                : filter === 'open'   ? open
                : closed;

  const counts: Record<PRFilter, number> = {
    all:    entries.length,
    merged: merged.length,
    open:   open.length,
    closed: closed.length,
  };

  if (entries.length === 0) {
    return <p className="text-xs text-slate-500 px-1 py-3">No PRs in the selected date range.</p>;
  }

  return (
    <div className="mt-3 space-y-2">
      {/* Filter tabs */}
      <div className="flex gap-1.5">
        {(['all', 'merged', 'open', 'closed'] as PRFilter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors capitalize ${
              filter === f
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700'
            }`}
          >
            {f} <span className="opacity-60">({counts[f]})</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-700">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-700 bg-slate-900/60">
              <th className="text-left text-slate-500 font-medium px-3 py-2 w-10">#</th>
              <th className="text-left text-slate-500 font-medium px-3 py-2">Title</th>
              <th className="text-left text-slate-500 font-medium px-3 py-2 hidden sm:table-cell">Repo</th>
              <th className="text-left text-slate-500 font-medium px-3 py-2">Type</th>
              <th className="text-left text-slate-500 font-medium px-3 py-2">State</th>
              <th className="text-left text-slate-500 font-medium px-3 py-2 hidden md:table-cell">Created</th>
              <th className="text-left text-slate-500 font-medium px-3 py-2 hidden md:table-cell">Merge&nbsp;Time</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(({ pr, repoKey }) => {
              const type = classifyPR(pr);
              const typeColor = PR_TYPE_COLORS[type];
              const prUrl = `${giteaUrl.replace(/\/$/, '')}/${repoKey}/pulls/${pr.number}`;
              const mergeTime = pr.merged && pr.merged_at
                ? differenceInHours(parseISO(pr.merged_at), parseISO(pr.created_at))
                : null;

              return (
                <tr key={`${repoKey}#${pr.number}`} className="border-b border-slate-700/50 hover:bg-slate-700/20 transition-colors">
                  {/* Number */}
                  <td className="px-3 py-2 text-slate-500 tabular-nums">#{pr.number}</td>

                  {/* Title */}
                  <td className="px-3 py-2 max-w-xs">
                    <a
                      href={prUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-slate-200 hover:text-sky-300 transition-colors flex items-start gap-1 group"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <span className="truncate leading-snug">{pr.title}</span>
                      <ExternalLink size={10} className="flex-shrink-0 mt-0.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                    </a>
                  </td>

                  {/* Repo */}
                  <td className="px-3 py-2 text-slate-400 hidden sm:table-cell whitespace-nowrap">{repoKey.split('/')[1]}</td>

                  {/* Type */}
                  <td className="px-3 py-2">
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium capitalize"
                      style={{ backgroundColor: `${typeColor}22`, color: typeColor, border: `1px solid ${typeColor}44` }}
                    >
                      {type}
                    </span>
                  </td>

                  {/* State */}
                  <td className="px-3 py-2">
                    {pr.merged ? (
                      <span className="inline-flex items-center gap-1 text-violet-400 font-medium">
                        <GitMerge size={11} /> merged
                      </span>
                    ) : pr.state === 'open' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                        <GitPullRequest size={11} /> open
                      </span>
                    ) : (
                      <span className="text-slate-500">closed</span>
                    )}
                  </td>

                  {/* Created */}
                  <td className="px-3 py-2 text-slate-500 hidden md:table-cell whitespace-nowrap">
                    {formatDistanceToNow(parseISO(pr.created_at), { addSuffix: true })}
                  </td>

                  {/* Merge time */}
                  <td className="px-3 py-2 text-slate-500 hidden md:table-cell">
                    {mergeTime !== null ? formatMergeTime(mergeTime) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Engineer Row ──────────────────────────────────────────────────────────────
function EngineerRow({ stats, giteaUrl }: { stats: EngineerStats; giteaUrl: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden transition-all">
      {/* Summary row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-slate-700/30 transition-colors text-left"
      >
        {/* Expand icon */}
        <span className="text-slate-500 flex-shrink-0">
          {expanded
            ? <ChevronDown size={16} />
            : <ChevronRight size={16} />}
        </span>

        {/* Avatar */}
        <img
          src={stats.user.avatar_url}
          alt={stats.user.login}
          className="w-8 h-8 rounded-full border border-slate-600 flex-shrink-0"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              `https://ui-avatars.com/api/?name=${encodeURIComponent(stats.user.login)}&background=0ea5e9&color=fff`;
          }}
        />

        {/* Name */}
        <div className="flex-1 min-w-0">
          <Link
            to={`/engineers/${stats.user.login}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-slate-100 hover:text-sky-300 transition-colors text-sm"
          >
            {stats.user.full_name || stats.user.login}
          </Link>
          <p className="text-xs text-slate-500">@{stats.user.login}</p>
        </div>

        {/* Metrics */}
        <div className="hidden sm:flex items-center gap-5 flex-shrink-0">
          <Stat icon={GitCommit}     label="Commits"   value={stats.totalCommits}              iconClass="text-sky-400" />
          <Stat icon={GitMerge}      label="Merged"     value={stats.mergedPRs}                 iconClass="text-violet-400" />
          <Stat icon={GitPullRequest} label="Total PRs" value={stats.totalPRs}                  iconClass="text-emerald-400" />
          <Stat icon={Flame}         label="Active"     value={`${stats.activeDays}d`}           iconClass="text-orange-400" />
        </div>

        {/* Score */}
        <div className="text-right flex-shrink-0 ml-2">
          <p className="text-base font-bold text-sky-400">{Math.round(stats.score)}</p>
          <p className="text-xs text-slate-500">score</p>
        </div>
      </button>

      {/* Expanded PR table */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-700/50">
          <PRTable entries={stats.prs ?? []} giteaUrl={giteaUrl} />
        </div>
      )}
    </div>
  );
}

function Stat({
  icon: Icon, label, value, iconClass,
}: { icon: typeof GitCommit; label: string; value: string | number; iconClass: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <Icon size={13} className={iconClass} />
      <p className="text-sm font-semibold text-slate-100 tabular-nums leading-none">{value}</p>
      <p className="text-xs text-slate-500 leading-none">{label}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function Engineers() {
  const { data, isLoading, error } = useAnalytics();
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const settings = loadSettings();

  if (isLoading) {
    return (
      <div className="p-6 space-y-5">
        <div className="space-y-1">
          <div className="h-6 w-32 bg-slate-700 rounded animate-pulse" />
          <div className="h-3 w-48 bg-slate-800 rounded animate-pulse" />
        </div>
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
        <p className="text-sm text-slate-500 mt-0.5">
          {data.engineers.length} contributors · click a row to expand PR list
        </p>
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

      {/* Accordion list */}
      <div className="space-y-2">
        {filtered.map((e) => (
          <EngineerRow key={e.user.login} stats={e} giteaUrl={settings.giteaUrl} />
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-10">No engineers match your search.</p>
        )}
      </div>
    </div>
  );
}
