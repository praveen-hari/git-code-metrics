// Gitea API types
export interface GiteaUser {
  id: number;
  login: string;
  full_name: string;
  email: string;
  avatar_url: string;
  created: string;
}

export interface GiteaCommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    };
    added: number;
    deleted: number;
  };
  author: GiteaUser | null;
  html_url: string;
  stats?: {
    additions: number;
    deletions: number;
    total: number;
  };
}

export interface GiteaPullRequest {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  user: GiteaUser;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  merged_at: string | null;
  merged: boolean;
  review_comments: number;
  additions: number;
  deletions: number;
  changed_files: number;
  labels: Array<{ name: string; color: string }>;
}

export interface GiteaRepo {
  id: number;
  name: string;
  full_name: string;
  owner: GiteaUser;
  description: string;
  private: boolean;
  stars_count: number;
  forks_count: number;
  open_issues_count: number;
  created: string;
  updated: string;
}

export interface GiteaIssue {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  user: GiteaUser;
  created_at: string;
  closed_at: string | null;
  comments: number;
}

export interface GiteaReview {
  id: number;
  user: GiteaUser;
  body: string;
  state: 'APPROVED' | 'REQUEST_CHANGES' | 'COMMENT' | 'PENDING';
  submitted_at: string;
}

// Analytics types
export interface DailyActivity {
  date: string; // YYYY-MM-DD
  commits: number;
  additions: number;
  deletions: number;
  prs: number;
}

export interface EngineerStats {
  user: GiteaUser;
  totalCommits: number;
  totalAdditions: number;
  totalDeletions: number;
  totalPRs: number;
  mergedPRs: number;
  openPRs: number;
  reviewsGiven: number;
  avgPRMergeTimeHours: number;
  activeDays: number;
  commitStreak: number;
  longestStreak: number;
  dailyActivity: DailyActivity[];
  weeklyCommits: number[];
  reposContributed: string[];
  score: number;
  rank: number;
}

export interface TeamStats {
  engineers: EngineerStats[];
  totalCommits: number;
  totalPRs: number;
  totalMergedPRs: number;
  activePeriod: { start: string; end: string };
  mostActiveDay: string;
  topContributor: EngineerStats | null;
}

export interface AppSettings {
  giteaUrl: string;
  token: string;
  repos: string[]; // format: "owner/repo"
  dateRange: '7d' | '30d' | '90d' | '180d' | '1y';
  scoringWeights: {
    commits: number;
    additions: number;
    prsCreated: number;
    prsMerged: number;
    reviewsGiven: number;
    activeDays: number;
  };
}

export const DEFAULT_SETTINGS: AppSettings = {
  giteaUrl: '',
  token: '',
  repos: [],
  dateRange: '30d',
  scoringWeights: {
    commits: 3,
    additions: 0.01,
    prsCreated: 5,
    prsMerged: 8,
    reviewsGiven: 4,
    activeDays: 2,
  },
};
