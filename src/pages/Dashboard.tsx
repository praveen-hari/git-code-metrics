import { GitCommit, GitMerge, GitPullRequest, Users, Calendar, Zap, Bot } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useTeamActivity } from '../hooks/useAnalytics';
import { StatCard } from '../components/StatCard';
import { VirtualEngineerList } from '../components/VirtualEngineerList';
import { Leaderboard } from '../components/Leaderboard';
import { ActivityChart } from '../components/ActivityChart';
import { StatCardSkeleton, ChartSkeleton, LeaderboardSkeleton } from '../components/Skeleton';
import { loadSettings } from '../store/settings';
import type { PrType } from '../types';
import { PR_TYPE_COLORS } from '../types';

export function Dashboard() {
  const { data, teamActivity, isLoading, error } = useTeamActivity();
  const settings = loadSettings();
  const isConfigured = !!(settings.giteaUrl && settings.token && settings.repos.length > 0);

  if (!isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-screen gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center">
          <GitCommit size={28} className="text-sky-400" />
        </div>
        <h1 className="text-2xl font-bold text-slate-100">Welcome to Git Metrics</h1>
        <p className="text-slate-400 max-w-md">
          Connect your Gitea instance to start tracking engineering productivity.
          Head to <strong className="text-sky-400">Settings</strong> to configure your Gitea URL, access token, and repositories.
        </p>
        <a
          href="/settings"
          className="mt-2 px-5 py-2.5 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Go to Settings →
        </a>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5"><div className="h-6 w-40 bg-slate-700 rounded animate-pulse" /><div className="h-3.5 w-64 bg-slate-800 rounded animate-pulse" /></div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
        <ChartSkeleton height={220} />
        <LeaderboardSkeleton rows={5} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-screen px-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 max-w-lg text-center">
          <p className="text-red-400 font-semibold mb-2">Failed to fetch data</p>
          <p className="text-slate-400 text-sm">{error.message}</p>
          <p className="text-slate-500 text-xs mt-2">Check your Gitea URL, token, and repository names in Settings.</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const mergeRate = data.totalPRs > 0 ? Math.round((data.totalMergedPRs / data.totalPRs) * 100) : 0;
  const csAiRate = data.totalPRs > 0 ? Math.round((data.totalCsAiUsage / data.totalPRs) * 100) : 0;
  const PR_TYPE_ORDER: PrType[] = ['feature', 'bug', 'refactor', 'chore', 'docs', 'test', 'other'];
  const totalTypedPRs = Object.values(data.teamPrsByType).reduce((a, b) => a + b, 0) || 1;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Team Dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {settings.repos.join(', ')} · Last {settings.dateRange}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5">
          <Calendar size={13} />
          {data.activePeriod.start && format(parseISO(data.activePeriod.start), 'MMM d')} –{' '}
          {data.activePeriod.end && format(parseISO(data.activePeriod.end), 'MMM d, yyyy')}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        <StatCard title="Total Commits" value={data.totalCommits} icon={GitCommit} iconColor="text-sky-400" />
        <StatCard title="Total PRs" value={data.totalPRs} icon={GitPullRequest} iconColor="text-violet-400" />
        <StatCard title="Merged PRs" value={data.totalMergedPRs} icon={GitMerge} iconColor="text-emerald-400" />
        <StatCard title="Merge Rate" value={`${mergeRate}%`} icon={Zap} iconColor="text-yellow-400" />
        <StatCard title="Engineers" value={data.engineers.length} icon={Users} iconColor="text-orange-400" />
        <StatCard
          title="Top Contributor"
          value={data.topContributor?.user.login ?? '—'}
          subtitle={data.topContributor ? `Score: ${Math.round(data.topContributor.score)}` : undefined}
          icon={Zap}
          iconColor="text-pink-400"
        />
        <StatCard
          title="AI PRs"
          value={data.totalCsAiUsage}
          subtitle={`${csAiRate}% of all PRs`}
          icon={Bot}
          iconColor="text-cyan-400"
        />
      </div>

      {/* PR Type Breakdown — stacked bar */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-3">Team PR Type Distribution</h3>
        {/* Stacked bar */}
        <div className="flex rounded-full overflow-hidden h-4 mb-3">
          {PR_TYPE_ORDER.map((type) => {
            const count = data.teamPrsByType[type];
            if (count === 0) return null;
            const pct = (count / totalTypedPRs) * 100;
            return (
              <div
                key={type}
                className="h-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: PR_TYPE_COLORS[type] }}
                title={`${type}: ${count} (${Math.round(pct)}%)`}
              />
            );
          })}
        </div>
        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {PR_TYPE_ORDER.filter((t) => data.teamPrsByType[t] > 0).map((type) => {
            const count = data.teamPrsByType[type];
            const pct = Math.round((count / totalTypedPRs) * 100);
            return (
              <div key={type} className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PR_TYPE_COLORS[type] }} />
                <span className="text-xs text-slate-400 capitalize">{type}</span>
                <span className="text-xs text-slate-600">{count} ({pct}%)</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Team Activity Chart */}
      <ActivityChart data={teamActivity} type="area" title="Team Commit Activity" height={220} />

      {/* Leaderboard */}
      <Leaderboard engineers={data.engineers} />

      {/* Engineer Cards — virtualised for large teams */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">Engineer Profiles</h2>
        <VirtualEngineerList engineers={data.engineers} totalEngineers={data.engineers.length} />
      </div>
    </div>
  );
}
