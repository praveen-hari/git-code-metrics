import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Save, Plus, Trash2, RefreshCw, CheckCircle } from 'lucide-react';
import { loadSettings, saveSettings } from '../store/settings';
import { initClient, getCurrentUser } from '../api/gitea';
import type { AppSettings } from '../types';
import { cn } from '../utils/cn';

export function Settings() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [newRepo, setNewRepo] = useState('');
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'ok' | 'error'>('idle');
  const [testMsg, setTestMsg] = useState('');

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  function updateWeight(key: keyof AppSettings['scoringWeights'], value: number) {
    setSettings((s) => ({
      ...s,
      scoringWeights: { ...s.scoringWeights, [key]: value },
    }));
  }

  function addRepo() {
    const r = newRepo.trim();
    if (!r || settings.repos.includes(r)) return;
    if (!r.includes('/')) {
      alert('Use format: owner/repo');
      return;
    }
    update('repos', [...settings.repos, r]);
    setNewRepo('');
  }

  function removeRepo(repo: string) {
    update('repos', settings.repos.filter((r) => r !== repo));
  }

  async function testConnection() {
    setTestStatus('loading');
    setTestMsg('');
    try {
      await initClient(settings.giteaUrl, settings.token);
      const user = await getCurrentUser();
      setTestStatus('ok');
      setTestMsg(`Connected as ${user.full_name || user.login} (@${user.login})`);
    } catch (e: unknown) {
      setTestStatus('error');
      // Provide specific guidance based on HTTP status
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 403) {
        setTestMsg('403 Forbidden — Token lacks required permissions. Ensure scopes include: read:user, repo, issues, pull_request.');
      } else if (status === 401) {
        setTestMsg('401 Unauthorized — Token is invalid or expired. Generate a new one from Gitea → Settings → Applications.');
      } else if (status === 404) {
        setTestMsg('404 — API not found. Verify the Gitea URL points to the root (e.g. https://gitea.example.com).');
      } else {
        setTestMsg(e instanceof Error ? e.message : 'Connection failed');
      }
    }
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    saveSettings(settings);
    // Fire-and-forget on save — proxy will be ready before user navigates away
    void initClient(settings.giteaUrl, settings.token);
    queryClient.invalidateQueries({ queryKey: ['analytics'] });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition-colors';
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5';

  return (
    <form onSubmit={handleSave} className="p-6 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configure your Gitea connection and scoring preferences</p>
      </div>

      {/* Connection */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200">Gitea Connection</h2>

        <div>
          <label className={labelCls}>Gitea Instance URL</label>
          <input
            type="url"
            value={settings.giteaUrl}
            onChange={(e) => update('giteaUrl', e.target.value)}
            placeholder="https://gitea.example.com"
            className={inputCls}
          />
          <p className="text-xs text-slate-600 mt-1">Your self-hosted Gitea base URL (no trailing slash)</p>
        </div>

        <div>
          <label className={labelCls}>Access Token</label>
          <input
            type="password"
            autoComplete="off"
            value={settings.token}
            onChange={(e) => update('token', e.target.value)}
            placeholder="Your Gitea personal access token"
            className={inputCls}
          />
          <div className="mt-1.5 text-xs text-slate-600 space-y-0.5">
            <p>Generate at: <code className="text-slate-400">{'<your-gitea>'}/user/settings/applications</code></p>
            <p className="text-slate-500">
              Required token permissions: <span className="text-sky-500">user</span>, <span className="text-sky-500">repository</span>, <span className="text-sky-500">issue</span> — all set to <em>Read</em>.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={testConnection}
          disabled={!settings.giteaUrl || !settings.token || testStatus === 'loading'}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 rounded-lg text-sm transition-colors"
        >
          <RefreshCw size={14} className={testStatus === 'loading' ? 'animate-spin' : ''} />
          Test Connection
        </button>
        {testStatus !== 'idle' && (
          <p className={cn('text-xs flex items-center gap-1.5 mt-1',
            testStatus === 'ok' ? 'text-emerald-400' : testStatus === 'error' ? 'text-red-400' : 'text-slate-400')}>
            {testStatus === 'ok' && <CheckCircle size={13} />}
            {testMsg}
          </p>
        )}
      </section>

      {/* Repositories */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200">Repositories to Track</h2>
        <p className="text-xs text-slate-500">Format: <code className="text-slate-400">owner/repo-name</code></p>

        <div className="flex gap-2">
          <input
            type="text"
            value={newRepo}
            onChange={(e) => setNewRepo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRepo())}
            placeholder="owner/repo"
            className={cn(inputCls, 'flex-1')}
          />
          <button
            type="button"
            onClick={addRepo}
            className="flex items-center gap-1.5 px-3 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={15} />
            Add
          </button>
        </div>

        {settings.repos.length > 0 ? (
          <ul className="space-y-2">
            {settings.repos.map((repo) => (
              <li key={repo} className="flex items-center justify-between bg-slate-700/40 rounded-lg px-3 py-2">
                <span className="text-sm text-slate-200 font-mono">{repo}</span>
                <button
                  type="button"
                  onClick={() => removeRepo(repo)}
                  className="text-slate-500 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-slate-600">No repositories added yet.</p>
        )}
      </section>

      {/* Date Range */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-200">Analysis Period</h2>
        <div className="flex flex-wrap gap-2">
          {(['7d', '30d', '90d', '180d', '1y'] as const).map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => update('dateRange', range)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                settings.dateRange === range
                  ? 'bg-sky-500 text-white'
                  : 'bg-slate-700 text-slate-400 hover:text-slate-200',
              )}
            >
              {range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : range === '90d' ? 'Last 3 months' : range === '180d' ? 'Last 6 months' : 'Last year'}
            </button>
          ))}
        </div>
      </section>

      {/* Scoring Weights */}
      <section className="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-200">Scoring Weights</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Adjust how each activity type contributes to the productivity score
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {(Object.entries(settings.scoringWeights) as [keyof AppSettings['scoringWeights'], number][]).map(([key, val]) => (
            <div key={key}>
              <label className={labelCls}>
                {key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase())}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={key === 'additions' ? 0.1 : 20}
                  step={key === 'additions' ? 0.001 : 0.5}
                  value={val}
                  onChange={(e) => updateWeight(key, parseFloat(e.target.value))}
                  className="flex-1 accent-sky-500"
                />
                <span className="text-xs text-sky-400 w-10 text-right font-mono">{val}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Save */}
      <button
        type="submit"
        className={cn(
          'flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium transition-all',
          saved
            ? 'bg-emerald-500 text-white'
            : 'bg-sky-500 hover:bg-sky-600 text-white',
        )}
      >
        {saved ? <CheckCircle size={16} /> : <Save size={16} />}
        {saved ? 'Saved!' : 'Save Settings'}
      </button>
    </form>
  );
}
