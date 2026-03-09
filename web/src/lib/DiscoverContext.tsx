import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { analyze, getAnalysis } from './api';
import { getAdoOrgUrl } from './settings';
import { useSettings } from './SettingsContext';
import type { FigmaSearchResult, PRMatchResult, AnalysisResult } from '../types';

export interface PendingAnalysis {
  tempId: string;
  figmaFileName: string;
  prTitle: string;
  prId: number;
  startedAt: string;
  status: 'running' | 'completed' | 'failed';
  progressPhase?: 'heuristic' | 'ai-review';
  result?: AnalysisResult;
  error?: string;
}

interface DiscoverContextValue {
  // Figma files
  files: FigmaSearchResult[];
  setFiles: (files: FigmaSearchResult[]) => void;

  // Team state
  selectedTeam: string;
  setSelectedTeam: (team: string) => void;
  teamFilesCache: Map<string, FigmaSearchResult[]>;
  setTeamFilesCache: React.Dispatch<React.SetStateAction<Map<string, FigmaSearchResult[]>>>;

  // PR matching results
  fileMatchMap: Map<string, PRMatchResult[]>;
  setFileMatchMap: (map: Map<string, PRMatchResult[]>) => void;
  cacheWarmed: boolean;
  setCacheWarmed: (v: boolean) => void;

  // Manual overrides
  overrideMap: Map<string, PRMatchResult>;
  setOverrideMap: React.Dispatch<React.SetStateAction<Map<string, PRMatchResult>>>;

  // Pending analyses
  pendingAnalyses: PendingAnalysis[];
  startAnalysis: (file: FigmaSearchResult, pr: PRMatchResult) => string;
  clearPending: (tempId: string) => void;
}

const DiscoverContext = createContext<DiscoverContextValue | null>(null);

const AI_POLL_INTERVAL_MS = 3000;
const AI_POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export function DiscoverProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();
  const [files, setFiles] = useState<FigmaSearchResult[]>([]);
  const [selectedTeam, setSelectedTeam] = useState('');
  const [teamFilesCache, setTeamFilesCache] = useState<Map<string, FigmaSearchResult[]>>(new Map());
  const [fileMatchMap, setFileMatchMap] = useState<Map<string, PRMatchResult[]>>(new Map());
  const [cacheWarmed, setCacheWarmed] = useState(false);
  const [overrideMap, setOverrideMap] = useState<Map<string, PRMatchResult>>(new Map());
  const [pendingAnalyses, setPendingAnalyses] = useState<PendingAnalysis[]>([]);
  const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Cleanup all poll intervals on unmount
  useEffect(() => {
    const intervals = pollIntervalsRef.current;
    return () => {
      for (const interval of intervals.values()) clearInterval(interval);
      intervals.clear();
    };
  }, []);

  const startAiPolling = useCallback((tempId: string, analysisId: string) => {
    const startTime = Date.now();
    const interval = setInterval(async () => {
      try {
        // Timeout: complete with whatever is available
        if (Date.now() - startTime > AI_POLL_TIMEOUT_MS) {
          clearInterval(interval);
          pollIntervalsRef.current.delete(tempId);
          setPendingAnalyses(prev =>
            prev.map(p => p.tempId === tempId ? { ...p, status: 'completed' as const } : p),
          );
          return;
        }

        const latest = await getAnalysis(analysisId);
        const aiStatus = latest.aiSummaryStatus;
        if (aiStatus === 'completed' || aiStatus === 'failed' || aiStatus === 'unavailable') {
          clearInterval(interval);
          pollIntervalsRef.current.delete(tempId);
          setPendingAnalyses(prev =>
            prev.map(p => p.tempId === tempId
              ? { ...p, status: 'completed' as const, result: latest }
              : p),
          );
        }
      } catch {
        // Polling error — don't fail, just retry on next tick
      }
    }, AI_POLL_INTERVAL_MS);
    pollIntervalsRef.current.set(tempId, interval);
  }, []);

  const startAnalysis = useCallback((file: FigmaSearchResult, pr: PRMatchResult): string => {
    const tempId = `pending-${Date.now()}`;
    const pending: PendingAnalysis = {
      tempId,
      figmaFileName: file.name,
      prTitle: pr.title,
      prId: pr.pullRequestId,
      startedAt: new Date().toISOString(),
      status: 'running',
      progressPhase: 'heuristic',
    };
    setPendingAnalyses(prev => [pending, ...prev]);

    // Fire analysis in background — updates state when done
    analyze({
      figmaUrl: file.figmaUrl,
      figmaPat: settings.figmaPat,
      prId: pr.pullRequestId,
      adoOrgUrl: getAdoOrgUrl(settings),
      adoProject: pr.project,
      adoRepoId: pr.repositoryId,
      adoPat: settings.adoPat,
    }).then(result => {
      if (result.status === 'failed') {
        // Heuristic failed — mark failed immediately
        setPendingAnalyses(prev =>
          prev.map(p => p.tempId === tempId
            ? { ...p, status: 'failed' as const, result, error: result.error }
            : p),
        );
        return;
      }

      if (result.aiSummaryStatus === 'unavailable') {
        // No AI to wait for (no PR provided) — complete immediately
        setPendingAnalyses(prev =>
          prev.map(p => p.tempId === tempId
            ? { ...p, status: 'completed' as const, result }
            : p),
        );
        return;
      }

      if (result.aiSummaryStatus === 'completed' || result.aiSummaryStatus === 'failed') {
        // AI already done (unlikely but handle it)
        setPendingAnalyses(prev =>
          prev.map(p => p.tempId === tempId
            ? { ...p, status: 'completed' as const, result }
            : p),
        );
        return;
      }

      // AI is pending/generating — switch to ai-review phase and start polling
      setPendingAnalyses(prev =>
        prev.map(p => p.tempId === tempId
          ? { ...p, progressPhase: 'ai-review' as const, result }
          : p),
      );
      startAiPolling(tempId, result.id);
    }).catch(err => {
      setPendingAnalyses(prev =>
        prev.map(p => p.tempId === tempId
          ? { ...p, status: 'failed' as const, error: err.message }
          : p),
      );
    });

    return tempId;
  }, [settings, startAiPolling]);

  const clearPending = useCallback((tempId: string) => {
    const interval = pollIntervalsRef.current.get(tempId);
    if (interval) {
      clearInterval(interval);
      pollIntervalsRef.current.delete(tempId);
    }
    setPendingAnalyses(prev => prev.filter(p => p.tempId !== tempId));
  }, []);

  return (
    <DiscoverContext.Provider
      value={{
        files, setFiles,
        selectedTeam, setSelectedTeam,
        teamFilesCache, setTeamFilesCache,
        fileMatchMap, setFileMatchMap,
        cacheWarmed, setCacheWarmed,
        overrideMap, setOverrideMap,
        pendingAnalyses, startAnalysis, clearPending,
      }}
    >
      {children}
    </DiscoverContext.Provider>
  );
}

export function useDiscover(): DiscoverContextValue {
  const ctx = useContext(DiscoverContext);
  if (!ctx) throw new Error('useDiscover must be used within DiscoverProvider');
  return ctx;
}
