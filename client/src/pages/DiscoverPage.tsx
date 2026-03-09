import { useState, useMemo } from 'react';
import { Filter, Search, FileText, GitPullRequest, Percent, Layers } from 'lucide-react';
import { Select } from '../components/Select';
import { TeamSwitcher } from '../components/TeamSwitcher';
import { DiscoverTable } from '../components/DiscoverTable';
import { useDiscover } from '../lib/DiscoverContext';
import type { FigmaSearchResult } from '../types';

export function DiscoverPage() {
  const { files, setFiles, fileMatchMap } = useDiscover();
  const [loading, setLoading] = useState(files.length === 0);
  const [error, setError] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [minConfidence, setMinConfidence] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const handleFilesLoaded = (loadedFiles: FigmaSearchResult[]) => {
    setFiles(loadedFiles);
    setLoading(false);
    setError('');
  };

  const handleError = (message: string) => {
    setError(message);
    setLoading(false);
  };

  const projects = useMemo(() => {
    const names = new Set(files.map(f => f.projectName).filter(Boolean));
    return [...names].sort();
  }, [files]);

  const filteredFiles = useMemo(() => {
    let result = files;
    if (projectFilter !== 'all') {
      result = result.filter(f => f.projectName === projectFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.projectName?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [files, projectFilter, searchQuery]);

  // Derive stats for bento cards
  const stats = useMemo(() => {
    const totalFiles = files.length;
    const matchedFiles = files.filter(f => {
      const m = fileMatchMap.get(f.fileKey);
      return m && m.length > 0;
    }).length;
    const highConfidence = files.filter(f => {
      const m = fileMatchMap.get(f.fileKey);
      return m && m.length > 0 && Math.round(m[0].score * 100) >= 70;
    }).length;
    const avgConfidence = matchedFiles > 0
      ? Math.round(files.reduce((sum, f) => {
          const m = fileMatchMap.get(f.fileKey);
          return sum + (m && m.length > 0 ? m[0].score * 100 : 0);
        }, 0) / matchedFiles)
      : 0;
    return { totalFiles, matchedFiles, highConfidence, avgConfidence, projectCount: projects.length };
  }, [files, fileMatchMap, projects]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-widest uppercase text-ink-secondary">Discover</h2>
        <TeamSwitcher onFilesLoaded={handleFilesLoaded} onError={handleError} />
      </div>

      {error && (
        <div className="rounded bg-sev-error/10 border border-sev-error/20 p-3 text-xs text-sev-error">{error}</div>
      )}

      {/* Bento stat cards */}
      {files.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded bg-panel-surface border border-border p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] tracking-widest uppercase text-ink-muted">Figma Files</span>
              <FileText className="h-3.5 w-3.5 text-ink-faint" />
            </div>
            <span className="text-3xl font-bold text-ink leading-none">{stats.totalFiles}</span>
            <span className="text-[10px] text-ink-muted mt-1.5">/ {stats.projectCount} projects</span>
          </div>

          <div className="rounded bg-panel-surface border border-border p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] tracking-widest uppercase text-ink-muted">PR Matches</span>
              <GitPullRequest className="h-3.5 w-3.5 text-ink-faint" />
            </div>
            <span className="text-3xl font-bold text-ink leading-none">{stats.matchedFiles}</span>
            <span className="text-[10px] text-ink-muted mt-1.5">/ {stats.totalFiles} files</span>
          </div>

          <div className="rounded bg-panel-surface border border-border p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] tracking-widest uppercase text-ink-muted">High Conf.</span>
              <Layers className="h-3.5 w-3.5 text-ink-faint" />
            </div>
            <span className="text-3xl font-bold text-sev-pass leading-none">{stats.highConfidence}</span>
            <span className="text-[10px] text-ink-muted mt-1.5">&ge;70% match</span>
          </div>

          <div className="rounded bg-panel-surface border border-border p-4 flex flex-col relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] tracking-widest uppercase text-ink-muted">Avg. Confidence</span>
              <Percent className="h-3.5 w-3.5 text-ink-faint" />
            </div>
            <span className="text-3xl font-bold text-accent-bright leading-none">{stats.avgConfidence}</span>
            <span className="text-[10px] text-ink-muted mt-1.5">across matched</span>
            {/* Confidence bar — prismatic signature in data */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${stats.avgConfidence}%`,
                  background: 'linear-gradient(90deg, #7c3aed, #3b82f6, #06b6d4)',
                  opacity: 0.5,
                }}
              />
            </div>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <>
          {/* Prismatic divider */}
          <div className="prism-bar rounded-full" />

          <div className="flex items-center gap-3 text-xs flex-wrap">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-ink-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search..."
                className="rounded bg-panel-surface border border-border pl-7 pr-3 py-1.5 text-xs text-ink outline-none focus:border-accent/40 w-48 placeholder:text-ink-faint"
              />
            </div>
            <div className="h-4 w-px bg-border-emphasis" />
            <Filter className="h-3.5 w-3.5 text-ink-muted" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracking-widest uppercase text-ink-muted">Project:</span>
              <Select
                value={projectFilter}
                onChange={setProjectFilter}
                options={[
                  { value: 'all', label: `All (${files.length})` },
                  ...projects.map(p => ({
                    value: p,
                    label: `${p} (${files.filter(f => f.projectName === p).length})`,
                  })),
                ]}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] tracking-widest uppercase text-ink-muted">Min:</span>
              <Select
                value={String(minConfidence)}
                onChange={v => setMinConfidence(Number(v))}
                options={[
                  { value: '0', label: 'Any' },
                  { value: '30', label: '30%+' },
                  { value: '50', label: '50%+' },
                  { value: '70', label: '70%+' },
                  { value: '90', label: '90%+' },
                ]}
              />
            </div>
            {(searchQuery || projectFilter !== 'all') && (
              <span className="text-ink-muted text-[10px] tracking-wider">
                {filteredFiles.length} / {files.length}
              </span>
            )}
          </div>
        </>
      )}

      <DiscoverTable files={filteredFiles} loading={loading} minConfidence={minConfidence} />
    </div>
  );
}
