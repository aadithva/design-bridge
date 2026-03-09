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
    // Skip if we already have match results for all current files
    const allMatched = files.every(f => fileMatchMap.has(f.fileKey));
    if (allMatched && fileMatchMap.size > 0) return;
    let cancelled = false;
    setWarmingCache(true);
    setMatchingFiles(true);

    const runBulkMatch = async () => {
      // Warm cache first, then do bulk match in one request
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
      <div className="text-center py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
        Loading files from your Figma teams...
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        No Figma files found. Check your team configuration.
      </div>
    );
  }

  if (visibleFiles.length === 0 && minConfidence > 0) {
    return (
      <div className="text-center py-16 text-slate-400">
        No files match the current confidence filter ({minConfidence}%+).
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white shadow-soft overflow-x-auto">
      {warmingCache && (
        <div className="flex items-center gap-2 px-6 py-3 bg-slate-50/80">
          <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          <span className="text-sm text-slate-500">Discovering PRs from 1JS repo...</span>
        </div>
      )}
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="text-left text-xs text-slate-400 uppercase tracking-wider">
            <th className="px-5 py-4 font-medium min-w-[180px]">File Name</th>
            <th className="px-5 py-4 font-medium min-w-[120px]">Project</th>
            <th className="px-5 py-4 font-medium min-w-[100px]">Last Updated</th>
            <th className="px-5 py-4 font-medium min-w-[120px]">Matched Repo</th>
            <th className="px-5 py-4 font-medium min-w-[180px]">Latest PR</th>
            <th className="px-5 py-4 font-medium min-w-[120px]">Confidence</th>
            <th className="px-5 py-4 font-medium min-w-[180px]">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {visibleFiles.map(file => {
            const matches = fileMatchMap.get(file.fileKey);
            const autoMatch = matches && matches.length > 0 ? matches[0] : null;
            const override = overrideMap.get(file.fileKey);
            const bestMatch = override || autoMatch;
            const isOverridden = !!override;
            const fileIsMatching = !matches && !override && isMatchingInProgress;
            const confidence = isOverridden ? 100 : (bestMatch ? getConfidence(bestMatch.score) : 0);

            return (
              <tr key={file.fileKey} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-5 py-4 font-semibold text-slate-900">{file.name}</td>
                <td className="px-5 py-4 text-slate-500">{file.projectName || '-'}</td>
                <td className="px-5 py-4 text-slate-500">{new Date(file.lastModified).toLocaleDateString()}</td>
                <td className="px-5 py-4 text-slate-500">
                  {fileIsMatching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />
                  ) : bestMatch ? (
                    <div className="flex flex-col">
                      <span>{bestMatch.repositoryName}</span>
                      {bestMatch.matchReason === 'repo_folder' && bestMatch.matchedComponent && (
                        <span className="text-[10px] text-slate-400 leading-tight">
                          └ {bestMatch.matchedComponent}
                        </span>
                      )}
                    </div>
                  ) : matches ? (
                    <span className="text-slate-300">-</span>
                  ) : null}
                </td>
                <td className="px-5 py-4">
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
                          className="w-20 rounded-lg bg-slate-50 px-2.5 py-1 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-slate-300"
                        />
                        <button
                          onClick={() => handleOverridePR(file.fileKey)}
                          disabled={!editPrId.trim() || editLoading}
                          className="p-1 rounded-md text-emerald-600 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
                          title="Confirm"
                        >
                          {editLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                        </button>
                        <button
                          onClick={() => { setEditingFileKey(null); setEditPrId(''); setEditError(''); }}
                          className="p-1 rounded-md text-slate-400 hover:bg-slate-100 transition-colors"
                          title="Cancel"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {editError && <span className="text-[11px] text-rose-500">{editError}</span>}
                    </div>
                  ) : fileIsMatching ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-300" />
                      <span className="text-slate-400">Matching...</span>
                    </span>
                  ) : bestMatch ? (
                    <div className="flex items-center gap-1.5 group">
                      <span className="text-slate-700">
                        #{bestMatch.pullRequestId} &ldquo;{bestMatch.title}&rdquo;
                      </span>
                      {isOverridden && (
                        <button
                          onClick={() => clearOverride(file.fileKey)}
                          className="p-0.5 rounded text-slate-300 hover:text-amber-600 hover:bg-amber-50 transition-colors"
                          title="Revert to auto-matched PR"
                        >
                          <Undo2 className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        onClick={() => { setEditingFileKey(file.fileKey); setEditPrId(''); setEditError(''); }}
                        className="p-0.5 rounded text-slate-300 opacity-0 group-hover:opacity-100 hover:text-blue-600 hover:bg-blue-50 transition-all"
                        title="Override with a different PR"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  ) : matches ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-300">No matching PR</span>
                      <button
                        onClick={() => { setEditingFileKey(file.fileKey); setEditPrId(''); setEditError(''); }}
                        className="p-0.5 rounded text-slate-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="Manually enter a PR ID"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                  ) : null}
                </td>
                <td className="px-5 py-4">
                  {bestMatch && (
                    <div className="flex flex-col gap-0.5">
                      <span
                        className={clsx(
                          'px-2 py-0.5 rounded-full text-xs font-medium w-fit',
                          confidence >= 70
                            ? 'bg-emerald-50 text-emerald-700'
                            : confidence >= 40
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-blue-50 text-blue-700',
                        )}
                      >
                        {confidence}%
                      </span>
                      {isOverridden && (
                        <span className="text-[10px] leading-tight text-indigo-600 font-medium">
                          Manual override
                        </span>
                      )}
                      {!isOverridden && bestMatch.matchReason && (
                        <span
                          className={clsx(
                            'text-[10px] leading-tight',
                            bestMatch.matchReason === 'figma_url'
                              ? 'text-emerald-600 font-medium'
                              : bestMatch.matchReason === 'repo_folder'
                                ? 'text-blue-600 font-medium'
                                : bestMatch.matchReason === 'commit_message'
                                  ? 'text-orange-600 font-medium'
                                  : 'text-slate-400',
                          )}
                        >
                          {bestMatch.matchReason === 'figma_url' && 'Figma URL in PR'}
                          {bestMatch.matchReason === 'repo_folder' && 'Folder match'}
                          {bestMatch.matchReason === 'commit_message' && 'Commit match'}
                          {bestMatch.matchReason === 'component_path' && 'File path match'}
                          {bestMatch.matchReason === 'pr_title' && 'Title match'}
                          {bestMatch.matchReason === 'branch_name' && 'Branch match'}
                          {bestMatch.matchReason === 'description_text' && 'Description match'}
                        </span>
                      )}
                    </div>
                  )}
                </td>
                <td className="px-5 py-4">
                  <button
                    disabled={!bestMatch}
                    onClick={() => bestMatch && handleStartAnalysis(file, bestMatch)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-soft-sm"
                  >
                    <ArrowRight className="h-3.5 w-3.5" />
                    Start Analysis
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
