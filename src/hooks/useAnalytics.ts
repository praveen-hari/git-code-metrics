import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchRepoData } from '../api/gitea';
import type { RepoData } from '../api/gitea';
import { computeEngineerStats } from '../utils/scoring';
import { loadSettings, getDateRangeStart } from '../store/settings';
import type { TeamStats, EngineerStats, GiteaReview, PrType } from '../types';
import { EMPTY_PR_BY_TYPE } from '../types';

// Stable query key — serialised so React Query deduplicates identical requests
// across multiple components mounting simultaneously (100s of users on same page)
function buildQueryKey(giteaUrl: string, repos: string[], dateRange: string) {
  return ['analytics', giteaUrl, [...repos].sort().join(','), dateRange] as const;
}

export function useAnalytics() {
  const settings = loadSettings();
  const isConfigured = !!(settings.giteaUrl && settings.token && settings.repos.length > 0);

  return useQuery<TeamStats, Error>({
    queryKey: buildQueryKey(settings.giteaUrl, settings.repos, settings.dateRange),
    enabled: isConfigured,
    staleTime: 5 * 60 * 1000,   // serve cached copy for 5 min — no spinner on revisit
    gcTime: 60 * 60 * 1000,      // keep in memory for 1 hour
    refetchOnMount: false,        // don't re-fetch if cached data is still fresh
    queryFn: async ({ signal }) => {
      const since = getDateRangeStart(settings.dateRange);
      const until = new Date();
      const sinceISO = since.toISOString();

      const repoPairs = settings.repos.map((r) => {
        const [owner, repo] = r.split('/');
        return { owner, repo };
      });

      // Parallel repo fetches — each respects the AbortSignal so if the user
      // navigates away mid-load, in-flight XHRs are cancelled immediately
      const allRepoData: RepoData[] = await Promise.all(
        repoPairs.map(({ owner, repo }) =>
          fetchRepoData(owner, repo, sinceISO, signal),
        ),
      );

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const allReviews = new Map<string, GiteaReview[]>();

      // Compute stats — CPU-bound work; runs once per cache miss, result memoised by React Query
      const engineers = computeEngineerStats(
        allRepoData,
        allReviews,
        settings.scoringWeights,
        since,
        until,
        settings.csAiLabel || 'cs_used',
      );

      const totalCommits = engineers.reduce((s, e) => s + e.totalCommits, 0);
      const totalPRs = engineers.reduce((s, e) => s + e.totalPRs, 0);
      const totalMergedPRs = engineers.reduce((s, e) => s + e.mergedPRs, 0);

      const dayTotals = new Map<string, number>();
      for (const eng of engineers) {
        for (const d of eng.dailyActivity) {
          dayTotals.set(d.date, (dayTotals.get(d.date) ?? 0) + d.commits);
        }
      }
      let mostActiveDay = '';
      let maxCommits = 0;
      for (const [day, count] of Array.from(dayTotals.entries())) {
        if (count > maxCommits) { maxCommits = count; mostActiveDay = day; }
      }

      const totalCsAiUsage = engineers.reduce((s, e) => s + e.csAiUsageCount, 0);
      const teamPrsByType = engineers.reduce((acc, e) => {
        for (const [type, count] of Object.entries(e.prsByType) as [PrType, number][]) {
          acc[type] = (acc[type] ?? 0) + count;
        }
        return acc;
      }, { ...EMPTY_PR_BY_TYPE });

      return {
        engineers,
        totalCommits,
        totalPRs,
        totalMergedPRs,
        activePeriod: { start: since.toISOString(), end: until.toISOString() },
        mostActiveDay,
        topContributor: engineers[0] ?? null,
        totalCsAiUsage,
        teamPrsByType,
      };
    },
  });
}

/** Derived hook — individual engineer detail, memoised from team data (no extra API call) */
export function useEngineerDetail(username: string) {
  const { data, ...rest } = useAnalytics();
  const engineer = useMemo<EngineerStats | undefined>(
    () => data?.engineers.find((e) => e.user.login === username),
    [data, username],
  );
  return { engineer, teamSize: data?.engineers.length ?? 0, ...rest };
}

/** Derived hook — team activity aggregated from cached engineer data */
export function useTeamActivity() {
  const { data, ...rest } = useAnalytics();
  const teamActivity = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { date: string; commits: number; additions: number; deletions: number; prs: number }>();
    for (const eng of data.engineers) {
      for (const d of eng.dailyActivity) {
        const e = map.get(d.date) ?? { date: d.date, commits: 0, additions: 0, deletions: 0, prs: 0 };
        e.commits += d.commits; e.additions += d.additions; e.deletions += d.deletions; e.prs += d.prs;
        map.set(d.date, e);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);
  return { data, teamActivity, ...rest };
}
