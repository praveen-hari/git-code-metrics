import { Link } from 'react-router-dom';
import type { EngineerStats } from '../types';
import { formatMergeTime } from '../utils/scoring';
import { cn } from '../utils/cn';

interface LeaderboardProps {
  engineers: EngineerStats[];
}

export function Leaderboard({ engineers }: LeaderboardProps) {
  const maxScore = engineers[0]?.score ?? 1;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700">
        <h3 className="text-sm font-semibold text-slate-300">Productivity Leaderboard</h3>
        <p className="text-xs text-slate-500 mt-0.5">Ranked by composite productivity score</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700">
              {['Rank', 'Engineer', 'Score', 'Commits', 'PRs', 'Merged', 'Reviews', 'Active Days', 'Avg Merge Time', 'Streak'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700/50">
            {engineers.map((eng) => {
              const barWidth = (eng.score / maxScore) * 100;
              const rankLabel = ['🥇', '🥈', '🥉'][eng.rank - 1] ?? `#${eng.rank}`;
              return (
                <tr key={eng.user.login} className="hover:bg-slate-700/30 transition-colors group">
                  <td className="px-4 py-3 text-center text-sm font-medium text-slate-400">
                    {rankLabel}
                  </td>
                  <td className="px-4 py-3">
                    <Link to={`/engineers/${eng.user.login}`} className="flex items-center gap-2.5 group-hover:text-sky-400 transition-colors">
                      <img
                        src={eng.user.avatar_url}
                        alt={eng.user.login}
                        className="w-7 h-7 rounded-full border border-slate-600"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(eng.user.login)}&background=0ea5e9&color=fff&size=28`;
                        }}
                      />
                      <div>
                        <p className="font-medium text-slate-200 text-sm leading-tight">{eng.user.full_name || eng.user.login}</p>
                        <p className="text-xs text-slate-500">@{eng.user.login}</p>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sky-400 font-bold text-sm whitespace-nowrap">{Math.round(eng.score)}</span>
                      <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500" style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-300 font-medium">{eng.totalCommits}</td>
                  <td className="px-4 py-3 text-slate-300">{eng.totalPRs}</td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', eng.mergedPRs > 0 ? 'bg-emerald-500/20 text-emerald-400' : 'text-slate-500')}>
                      {eng.mergedPRs}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{eng.reviewsGiven}</td>
                  <td className="px-4 py-3">
                    <span className="text-orange-400 font-medium">{eng.activeDays}</span>
                    <span className="text-slate-500 text-xs ml-1">days</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-xs">
                    {eng.avgPRMergeTimeHours > 0 ? formatMergeTime(eng.avgPRMergeTimeHours) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn('text-xs font-medium', eng.commitStreak > 0 ? 'text-yellow-400' : 'text-slate-600')}>
                      🔥 {eng.commitStreak}d
                    </span>
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
