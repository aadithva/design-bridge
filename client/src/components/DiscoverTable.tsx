import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { ArrowRight, Loader2, Pencil, Check, X, Undo2 } from 'lucide-react';
import { clsx } from 'clsx';
import { useSettings } from '../lib/SettingsContext';
import { useDiscover } from '../lib/DiscoverContext';
import { getAdoOrgUrl } from '../lib/settings';
import { warmCraftPRs, matchFilesBulk, lookupPR } from '../lib/api';
import type { FigmaSearchResult, PRMatchResult } from '../types';

interface Props {
  files: FigmaSearchResult[];
  loading: boolean;
  minConfidence?: number;
}

export function DiscoverTable({ files, loading, minConfidence = 0 }: Props) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { fileMatchMap, setFileMatchMap, cacheWarmed, setCacheWarmed, overrideMap, setOverrideMap, startAnalysis } = useDiscover();
  const [warmingCache, setWarmingCache] = useState(false);
  const [matchingFiles, setMatchingFiles] = useState(false);
  const [editingFileKey, setEditingFileKey] = useState<string | null>(null);
  const [editPrId, setEditPrId] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const handleOverridePR = async (fileKey: string) => {
    const prIdNum = parseInt(editPrId.trim(), 10);
    if (!prIdNum || !settings.adoPat) return;

    setEditLoading(true);
    setEditError('');
    try {
      const data = await lookupPR({
        adoOrgUrl: getAdoOrgUrl(settings),
        adoPat: settings.adoPat,
        project: settings.adoDefaultProject || 'Office',
        pullRequestId: prIdNum,
      });
      const override: PRMatchResult = {
        pullRequestId: data.pullRequestId,
        title: data.title,
        repositoryId: data.repositoryId,
        repositoryName: data.repositoryName,
        project: data.project,
        createdBy: '',
        creationDate: '',
        sourceRefName: '',
        matchedComponent: '',
        score: 1.0,
        uiFiles: [],
        matchReason: 'manual',
      };
      setOverrideMap(prev => new Map(prev).set(fileKey, override));
      setEditingFileKey(null);
      setEditPrId('');
    } catch (err: any) {
      setEditError(err.message || 'PR not found');
    } finally {
      setEditLoading(false);
    }
  };

  const clearOverride = (fileKey: string) => {
    setOverrideMap(prev => {
      const next = new Map(prev);
      next.delete(fileKey);
      return next;
    });
  };

  useEffect(() => {
    if (files.length === 0 || !settings.adoPat) return;
    const allMatched = files.every(f => fileMatchMap.has(f.fileKey));
    if (allMatched && fileMatchMap.size > 0) return;
    let cancelled = false;
    setWarmingCache(true);
    setMatchingFiles(true);

    const runBulkMatch = async () => {
      await warmCraftPRs({ adoOrgUrl: getAdoOrgUrl(settings), adoPat: settings.adoPat, projects: ['Office'] }).catch(() => {});
      if (cancelled) return;
      setCacheWarmed(true);
      setWarmingCache(false);

      try {
        const data = await matchFilesBulk({
          adoOrgUrl: getAdoOrgUrl(settings),
          adoPat: settings.adoPat,
          projects: ['Office'],
          files: files.map(f => ({ name: f.name, fileKey: f.fileKey })),
        });
        if (!cancelled) {
          const results = new Map<string, PRMatchResult[]>();
          for (const [key, matches] of Object.entries(data.results)) {
            results.set(key, matches || []);
          }
          setFileMatchMap(results);
        }
      } catch { /* non-fatal */ }
      if (!cancelled) setMatchingFiles(false);
    };
    runBulkMatch();
    return () => { cancelled = true; };
  }, [files, settings.adoPat]);

  const handleStartAnalysis = (file: FigmaSearchResult, pr: PRMatchResult) => {
    startAnalysis(file, pr);
    navigate('/reports');
  };

  const isMatchingInProgress = warmingCache || matchingFiles;

  const getConfidence = (surfaceScore: number): number => {
    return Math.round(surfaceScore * 100);
  };

  const visibleFiles = useMemo(() => {
    if (minConfidence <= 0 || isMatchingInProgress) return files;
    return files.filter(file => {
      const matches = fileMatchMap.get(file.fileKey);
      if (!matches || matches.length === 0) return false;
      return getConfidence(matches[0].score) >= minConfidence;
    });
  }, [files, fileMatchMap, minConfidence, isMatchingInProgress]);

  if (loading) {
    return (
      <div className="text-center py-16 text-ink-muted">
        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
        <span className="text-[10px] tracking-wider uppercase">Loading Figma files...</span>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-16 text-ink-muted text-xs">
        No Figma files found. Check your team configuration.
      </div>
    );
  }

  if (visibleFiles.length === 0 && minConfidence > 0) {
    return (
      <div className="text-center py-16 text-ink-muted text-xs">
        No files match confidence filter ({minConfidence}%+).
      </div>
    );
  }

  return (
    <div className="rounded bg-panel-surface border border-border overflow-x-auto">
      {warmingCache && (
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-border">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" />
          <span className="text-[10px] tracking-wider uppercase text-ink-muted">Discovering PRs from 1JS repo...</span>
        </div>
      )}
      <table className="w-full text-xs min-w-[900px]">
        <thead>
          <tr className="text-left text-[10px] text-ink-muted tracking-widest uppercase border-b border-border">
            <th className="px-4 py-3 font-medium min-w-[180px]">File</th>
            <th className="px-4 py-3 font-medium min-w-[100px]">Project</th>
            <th className="px-4 py-3 font-medium min-w-[90px]">Updated</th>
            <th className="px-4 py-3 font-medium min-w-[100px]">Repo</th>
            <th className="px-4 py-3 font-medium min-w-[180px]">PR</th>
            <th className="px-4 py-3 font-medium min-w-[100px]">Conf.</th>
            <th className="px-4 py-3 font-medium min-w-[120px]">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {visibleFiles.map(file => {
            const matches = fileMatchMap.get(file.fileKey);
            const autoMatch = matches && matches.length > 0 ? matches[0] : null;
            const override = overrideMap.get(file.fileKey);
            const bestMatch = override || autoMatch;
            const isOverridden = !!override;
            const fileIsMatching = !matches && !override && isMatchingInProgress;
            const confidence = isOverridden ? 100 : (bestMatch ? getConfidence(bestMatch.score) : 0);

            return (
              <tr key={file.fileKey} className="hover:bg-panel-hover/50 transition-colors">
                <td className="px-4 py-3 font-medium text-ink">{file.name}</td>
                <td className="px-4 py-3 text-ink-secondary">{file.projectName || '-'}</td>
                <td className="px-4 py-3 text-ink-muted">{new Date(file.lastModified).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-ink-secondary">
                  {fileIsMatching ? (
                    <Loader2 className="h-3 w-3 animate-spin text-ink-faint" />
                  ) : bestMatch ? (
                    <div className="flex flex-col">
                      <span>{bestMatch.repositoryName}</span>
                      {bestMatch.matchReason === 'repo_folder' && bestMatch.matchedComponent && (
                        <span className="text-[10px] text-ink-faint leading-tight">
                          {bestMatch.matchedComponent}
                        </span>
                      )}
                    </div>
                  ) : matches ? (
                    <span className="text-ink-faint">-</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {editingFileKey === file.fileKey ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editPrId}
                          onChange={e => { setEditPrId(e.target.value); setEditError(''); }}
                          placeholder="PR ID"
                          autoFocus
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleOverridePR(file.fileKey);
                            if (e.key === 'Escape') { setEditingFileKey(null); setEditPrId(''); setEditError(''); }
                          }}
                          className="w-20 rounded bg-panel-base border border-border px-2 py-1 text-xs text-ink outline-none focus:border-accent/40 placeholder:text-ink-faint"
                        />
                        <button
                          onClick={() => handleOverridePR(file.fileKey)}
                          disabled={!editPrId.trim() || editLoading}
                          className="p-1 rounded text-sev-pass hover:bg-sev-pass/10 disabled:opacity-40 transition-colors"
                          title="Confirm"
                        >
                          {editLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        </button>
                        <button
                          onClick={() => { setEditingFileKey(null); setEditPrId(''); setEditError(''); }}
                          className="p-1 rounded text-ink-muted hover:bg-panel-hover transition-colors"
                          title="Cancel"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      {editError && <span className="text-[10px] text-sev-error">{editError}</span>}
                    </div>
                  ) : fileIsMatching ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3 w-3 animate-spin text-ink-faint" />
                      <span className="text-ink-muted text-[10px] tracking-wider uppercase">Matching...</span>
                    </span>
                  ) : bestMatch ? (
                    <div className="flex items-center gap-1.5 group">
                      <span className="text-ink-secondary">
                        #{bestMatch.pullRequestId} {bestMatch.title}
                      </span>
                      {isOverridden && (
                        <button
                          onClick={() => clearOverride(file.fileKey)}
                          className="p-0.5 rounded text-ink-faint hover:text-sev-warning hover:bg-sev-warning/10 transition-colors"
                          title="Revert to auto-matched PR"
                        >
                          <Undo2 className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        onClick={() => { setEditingFileKey(file.fileKey); setEditPrId(''); setEditError(''); }}
                        className="p-0.5 rounded text-ink-faint opacity-0 group-hover:opacity-100 hover:text-accent hover:bg-accent-dim transition-all"
                        title="Override with a different PR"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  ) : matches ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink-faint">No match</span>
                      <button
                        onClick={() => { setEditingFileKey(file.fileKey); setEditPrId(''); setEditError(''); }}
                        className="p-0.5 rounded text-ink-faint hover:text-accent hover:bg-accent-dim transition-colors"
                        title="Manually enter a PR ID"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {bestMatch && (
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={clsx(
                          'px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wider w-fit border',
                          confidence >= 70
                            ? 'bg-sev-pass/10 text-sev-pass border-sev-pass/20'
                            : confidence >= 40
                              ? 'bg-sev-warning/10 text-sev-warning border-sev-warning/20'
                              : 'bg-accent-dim text-accent border-accent/20',
                        )}
                      >
                        {confidence}%
                      </span>
                      {isOverridden && (
                        <span className="text-[10px] leading-tight text-accent tracking-wider uppercase">
                          Manual
                        </span>
                      )}
                      {!isOverridden && bestMatch.matchReason && (
                        <span
                          className={clsx(
                            'text-[10px] leading-tight tracking-wider',
                            bestMatch.matchReason === 'figma_url'
                              ? 'text-sev-pass'
                              : bestMatch.matchReason === 'repo_folder'
                                ? 'text-accent'
                                : bestMatch.matchReason === 'commit_message'
                                  ? 'text-sev-warning'
                                  : 'text-ink-muted',
                          )}
                        >
                          {bestMatch.matchReason === 'figma_url' && 'URL'}
                          {bestMatch.matchReason === 'repo_folder' && 'Folder'}
                          {bestMatch.matchReason === 'commit_message' && 'Commit'}
                          {bestMatch.matchReason === 'component_path' && 'Path'}
                          {bestMatch.matchReason === 'pr_title' && 'Title'}
                          {bestMatch.matchReason === 'branch_name' && 'Branch'}
                          {bestMatch.matchReason === 'description_text' && 'Desc'}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    disabled={!bestMatch}
                    onClick={() => bestMatch && handleStartAnalysis(file, bestMatch)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] tracking-wider uppercase rounded bg-accent/20 text-accent-bright hover:bg-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    <ArrowRight className="h-3 w-3" />
                    Analyze
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
