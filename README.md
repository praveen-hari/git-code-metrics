# Git Code Metrics

A DORA-aligned engineering coaching dashboard that connects to a self-hosted **Gitea** instance and surfaces delivery flow metrics for individual engineers and teams.

> ⚠️ **Important:** This tool is for coaching and self-improvement only. Metrics derived from Git data are not a complete or fair measure of an engineer's value. Do not use them for compensation, promotion, or performance ranking.

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Architecture](#architecture)
3. [How Metrics Are Calculated](#how-metrics-are-calculated)
   - [Raw Data Collected](#raw-data-collected)
   - [Flow Metrics](#flow-metrics)
   - [Collaboration Metrics](#collaboration-metrics)
   - [Work Type Detection](#work-type-detection)
   - [Developer Flow Index](#developer-flow-index)
   - [Team DORA Aggregates](#team-dora-aggregates)
4. [Coaching Thresholds](#coaching-thresholds)
5. [How to Use These Metrics Responsibly](#how-to-use-these-metrics-responsibly)
6. [What Git Metrics Cannot Measure](#what-git-metrics-cannot-measure)
7. [References](#references)

---

## Getting Started

### Prerequisites

- Node.js 18+
- A running [Gitea](https://gitea.io) instance
- A Gitea personal access token with `user`, `repository`, and `issue` **Read** permissions

### Install and run

```bash
npm install
npm run dev
```

Open `http://localhost:5173` and go to **Settings** to configure:

| Setting | Description |
|---|---|
| Gitea URL | Base URL of your Gitea instance, e.g. `https://gitea.example.com` |
| Access Token | Personal access token from `<gitea>/user/settings/applications` |
| Repositories | One or more `owner/repo` pairs to analyse |
| Date Range | 7 days · 30 days · 3 months · 6 months · 1 year |
| Coaching Thresholds | Team-specific targets used to normalise the Flow Index |

### Build for production

```bash
npm run build        # TypeScript check + Vite bundle
```

Output goes to `dist/`. Serve with any static static host (nginx, Caddy, etc.).

> **Important — production CORS proxy**
>
> The Vite dev-server proxy (`/gitea-api/*`) only exists during development.  
> In production you must expose a reverse-proxy route that forwards `/gitea-api/*`
> to your Gitea instance, otherwise API calls will be blocked by the browser's
> same-origin policy.
>
> **nginx example** (place inside your `server {}` block):
>
> ```nginx
> location /gitea-api/ {
>     proxy_pass         https://your-gitea-host/;
>     proxy_set_header   Host              your-gitea-host;
>     proxy_set_header   Authorization     $http_authorization;
>     proxy_set_header   X-Real-IP         $remote_addr;
>     proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
>     proxy_ssl_server_name on;
> }
> ```
>
> **Caddy example** (place inside your site block):
>
> ```caddy
> handle /gitea-api/* {
>     uri strip_prefix /gitea-api
>     reverse_proxy https://your-gitea-host {
>         header_up Host {upstream_hostport}
>         header_up Authorization {http.request.header.Authorization}
>     }
> }
> ```

---

## Architecture

```
src/
├── api/
│   └── gitea.ts          # Gitea REST API client — pagination, AbortSignal, proxy registration
├── components/           # Reusable UI: charts, heatmap, leaderboard, skeleton loaders, virtual list
├── hooks/
│   └── useAnalytics.ts   # React Query data fetching + memoised derived hooks
├── pages/                # Dashboard · Engineers · EngineerDetail · Activity · Settings
├── store/
│   └── settings.ts       # localStorage-backed settings persistence
├── types/
│   └── index.ts          # All TypeScript interfaces (EngineerStats, TeamStats, etc.)
└── utils/
    └── scoring.ts        # All metric computation logic — Flow Index, work type, DORA aggregates
```

**CORS proxy:** Browsers block cross-origin Gitea API calls. The Vite dev server includes a dynamic proxy plugin — all API calls go to `/gitea-api/*` which the server forwards server-to-server to your Gitea instance with the `Authorization` header attached. No browser CORS issue.

**Caching:** React Query persists data to `localStorage` (key: `gitea-metrics-cache`) with a 5-minute stale window and 1-hour in-memory TTL. Navigating between pages does not trigger re-fetches while data is fresh. A version key in the query key busts the cache automatically when the data schema changes.

**Performance:** Engineer card lists are virtualised with `react-window` — only the visible rows are rendered regardless of team size. Pages are lazy-loaded as separate JS chunks.

---

## How Metrics Are Calculated

### Raw Data Collected

For each configured repository the app fetches from the Gitea API:

| Endpoint | Data used |
|---|---|
| `GET /repos/{owner}/{repo}/commits` | SHA, author (Gitea user + git name), timestamp, additions/deletions |
| `GET /repos/{owner}/{repo}/pulls?state=closed&type=pulls` | State, created_at, merged_at, additions, deletions, changed_files, review_comments, labels |
| `GET /repos/{owner}/{repo}/pulls?state=open` | Open PRs for WIP count |
| `GET /repos/{owner}/{repo}/issues` | Used for activity timeline only |

All requests use `since` ISO timestamp to scope to the selected date range. Pagination is handled automatically (100 items per page, up to all pages).

**Engineer identity:** Engineers are matched by `commit.author.login` (linked Gitea account). Commits not linked to a Gitea account fall back to the git `author.name` normalised to lowercase (`First Last` → `first.last`).

---

### Flow Metrics

#### PR Cycle Time

> Time from PR opened → PR merged.

```
cycleTime (hours) = merged_at − created_at
```

Computed per merged PR then summarised as the **median** across all merged PRs in the period.

Median is used instead of mean because a single long-running PR (e.g. a large feature branch) would otherwise inflate the average and make a healthy engineer look slow.

**What drives cycle time:**
- PR size — larger PRs wait longer for reviews
- Reviewer availability — reflected in pickup time
- Number of review iterations — reflected in rework rate
- CI/CD wait times — not separately measurable from Git data

**DORA reference:** "Lead time for changes" is one of DORA's four key software delivery performance metrics. Elite performers merge in less than one hour; high performers in less than one day.

---

#### Review Pickup Time

> Time from PR opened → first review submitted.

```
pickupTime (hours) = first_review.submitted_at − pr.created_at
```

Only computed when per-PR review events are available from the API (`GET /pulls/{index}/reviews`). Shown as `—` when not available.

**Why it matters:** Long pickup time is a *team* problem, not an individual one — it usually indicates insufficient reviewer bandwidth or unclear review ownership, not laziness.

---

#### Merge Frequency

> How many PRs does an engineer merge per week?

```
mergeFrequency = mergedPRs / weeksInPeriod
```

DORA's "deployment frequency" is the team-level equivalent. Higher frequency generally indicates smaller, safer changes shipped more incrementally.

---

#### WIP (Work in Progress)

> Number of currently open PRs authored by this engineer.

High WIP means multiple in-flight changes, which increases context-switching cost and often increases cycle time across all of them.

---

### Collaboration Metrics

#### Reviews Given Per Week

```
reviewsPerWeek = totalReviewsSubmitted / weeksInPeriod
```

Code review is a primary knowledge-sharing and quality mechanism. Engineers who review regularly spread architectural understanding, catch defects, and reduce bus-factor.

**Limitation:** This counts review submissions, not review quality. A one-word "LGTM" and a detailed ten-comment architectural review count identically.

---

#### Rework Rate

> What fraction of your PRs required at least one round of changes?

```
reworkRate = PRsWithAtLeastOneChangeRequest / totalPRs
```

**Primary source:** Review events with `state: REQUEST_CHANGES` from the Gitea reviews API.

**Fallback proxy:** When review event data is unavailable, PRs with `review_comments > 1` are used as a proxy.

**Interpretation:**
- **~0%** — reviews may be rubber-stamping; or engineer consistently ships very clear, well-scoped PRs
- **10–25%** — healthy; the review process is catching issues before merge
- **>40%** — worth investigating: PRs may be too large, specs unclear, or there is a communication gap

**Important:** High rework on a junior engineer's PRs often reflects active mentoring from seniors — a positive team dynamic, not a failure.

---

#### Average Review Comments Per PR

```
avgComments = Σ(pr.review_comments) / totalPRs
```

A proxy for review depth. Higher comment density may reflect complex PRs, thorough reviewers, or both.

---

### Work Type Detection

Work type is inferred from PR **title** and **label names** using regex matching:

| Type | Matched patterns |
|---|---|
| **Feature** | `feat`, `feature`, `add`, `new`, `implement`, `enhance`, `support`, `enable`, `introduce` |
| **Bug Fix** | `fix`, `bug`, `hotfix`, `patch`, `revert`, `regression`, `broken` |
| **Refactor / Chore** | `refactor`, `cleanup`, `chore`, `tech-debt`, `style`, `lint`, `deps` |
| **Other** | Anything not matched above |

This follows [Conventional Commits](https://www.conventionalcommits.org/) and common Gitea/GitHub label conventions.

**Why work type matters:** Feature work, bug fixes, and refactors have naturally different cycle times, PR sizes, and rework rates. A 3-day cycle time on a complex new feature is excellent; the same time on a one-line bug fix may indicate a blocked review queue. Always segment by work type before drawing conclusions from cycle time.

Teams with non-standard PR title formats will see more in the "Other" bucket. Use consistent Gitea labels to improve accuracy.

---

### Developer Flow Index

A single 0–100 composite coaching score that normalises the five flow signals against your team's configured benchmarks.

```
Flow Index = 0.35 × cycleScore
           + 0.20 × pickupScore
           + 0.15 × reviewScore
           + 0.15 × reworkScore
           + 0.15 × sizeScore
```

Each component is independently normalised to [0, 100] before weighting:

| Component | Formula | Score = 100 | Score = 0 |
|---|---|---|---|
| **Cycle Score** (35%) | `100 − (medianCycleHours / benchmark) × 50` | Instant merge | 2× benchmark |
| **Pickup Score** (20%) | `100 − (pickupHours / benchmark) × 50` | Instant first review | 2× benchmark |
| **Review Score** (15%) | `(reviewsPerWeek / target) × 100` | At or above target | Zero reviews |
| **Rework Score** (15%) | `100 − (reworkRate / threshold) × 50` | Zero rework | 2× threshold |
| **Size Score** (15%) | `100 − (avgSizeLines / target) × 50` | Tiny PRs | 2× size target |

All components are clamped to [0, 100]. If data is missing (e.g. no merged PRs yet), the component defaults to **50** (neutral) to avoid penalising engineers in new or quiet repos.

#### Flow Index colour scale

| Score | Colour | Interpretation |
|---|---|---|
| 70–100 | 🟢 Green | Healthy delivery flow |
| 45–69 | 🟡 Amber | One or more components worth reviewing |
| 0–44 | 🔴 Red | Blocked — look at individual components, not the total |

#### What the Flow Index is not

- It is **not** a productivity score — it measures delivery flow, not value delivered
- It is **not** comparable between engineers with different work types or repo contexts
- It is **not** a performance rating — do not use it in reviews or compensation decisions
- The ranking in the leaderboard reflects who has the healthiest *current* flow pattern, not who is the best engineer

**The right use:** Compare an engineer's Flow Index to their own score from last month. A positive trend is a coaching success. A negative trend is a question worth asking — not an accusation.

---

### Team DORA Aggregates

Displayed on the Dashboard, these roll up individual metrics to team level:

| Metric | Calculation |
|---|---|
| **Median Cycle Time** | Mean of each engineer's median cycle time (engineers with no merges excluded) |
| **Avg Review Pickup** | Mean of each engineer's pickup time (engineers with no review data excluded) |
| **Merges / Week** | `totalMergedPRs / weeksInPeriod` (team-level deployment frequency proxy) |
| **WIP** | Sum of all open PRs across all engineers |
| **Avg Rework Rate** | Mean rework rate across all engineers |
| **Avg Flow Index** | Mean Flow Index across all engineers |

---

## Coaching Thresholds

Configurable in **Settings → Coaching Thresholds**. These define "good" for your team and affect only the Flow Index normalisation — raw metric values are always shown as-is.

| Threshold | Default | Guidance |
|---|---|---|
| **Cycle Time Target** | 48 hours | DORA "high performer" is < 1 day; 48h is a reasonable starting point for PR cycle time |
| **Pickup Time Target** | 4 hours | GitHub research suggests < 1 business day; 4h is an aspirational same-day target |
| **Reviews / Week Target** | 3 | Adjust to your team size and review load; 3/wk is realistic for a 5–8 person team |
| **Rework Rate Threshold** | 15% | Some rework is healthy (reviews are working); set higher if your team routinely iterates on PRs |
| **PR Size Target** | 200 lines | Research suggests 200–400 lines is the sweet spot for effective reviews |

Set these to reflect your team's **actual current baseline**, then raise them gradually as flow improves.

---

## How to Use These Metrics Responsibly

### ✅ Good uses

- Compare an engineer's metrics to **their own history** — trend matters more than absolute value
- Use as a **conversation opener**: *"Your cycle time increased this month — is anything blocking reviews?"*
- Identify **team-level bottlenecks**: consistently high pickup time across the team → review process problem, not individual problem
- Track **improvement over quarters** after process changes (new review guidelines, PR size norms, etc.)
- Give engineers **self-serve visibility** so they can advocate for their own unblocking

### ❌ Do not

- Use Flow Index or any single metric for **performance reviews, compensation, or promotion**
- **Rank engineers against each other** using these scores — context differences make comparisons unfair
- Draw conclusions from **fewer than 30 days** of data
- Penalise high rework rate without understanding whether it reflects **learning, complex problems, or unclear requirements**
- Treat a low score for a senior engineer as underperformance — their highest-value work (architecture, mentoring, debugging) leaves **no Git signal**

---

## What Git Metrics Cannot Measure

These are significant dimensions of engineering value with no Git signal:

| Invisible activity | Why it matters |
|---|---|
| System design and architecture | Often the highest-leverage work; may result in *fewer* commits |
| Mentoring and unblocking others | Time spent is invisible in version control |
| Code review quality | A thorough architectural review and a "LGTM" look identical in the API |
| Incident response and on-call | Post-incident fixes appear as ordinary small PRs |
| Documentation, RFCs, ADRs | May not live in the tracked repos |
| Planning, estimation, scoping | No commit trail |
| Deleting code / simplifying systems | Refactors often *reduce* merge frequency and *increase* PR size |
| Cross-team coordination | Entirely invisible |
| Customer and product impact | A 5-line change can ship a $1M feature |

> A principal engineer who spends a week unblocking three junior engineers, designing an architecture that avoids six months of future rework, and reviewing ten PRs in depth will show a lower Flow Index than a junior engineer who ships twenty small formatting fixes. **Git metrics alone cannot distinguish these outcomes.**

---

## References

- [DORA Research — State of DevOps](https://dora.dev/research/) — foundational research on cycle time, deployment frequency, and delivery stability
- [SPACE Framework — Microsoft Research (2021)](https://queue.acm.org/detail.cfm?id=3454124) — multi-dimensional developer productivity: Satisfaction, Performance, Activity, Communication, Efficiency
- [GitHub Docs — Pull requests](https://docs.github.com/en/pull-requests) — PR review as a quality and knowledge-sharing mechanism
- [McKinsey — Yes, you can measure software developer productivity (2023)](https://www.mckinsey.com/industries/technology-media-and-telecommunications/our-insights/yes-you-can-measure-software-developer-productivity) — combining DORA, SPACE, and qualitative signals
- [Conventional Commits](https://www.conventionalcommits.org/) — PR title conventions used for work type detection
- [Google — Code Health: Understanding Code Changes](https://testing.googleblog.com/) — PR size and review effectiveness research
