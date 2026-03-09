import { createContext, useContext, useState, useCallback, useRef, useEffect, type ReactNode } from 'react';
import { analyze, getAnalysis } from './api';
import { getAdoOrgUrl } from './settings';
import { useSettings } from './SettingsContext';
import type { FigmaSearchResult, PRMatchResult, AnalysisResult } from '../types';

export interface PendingAnalysis {
  tempId: string;
  figmaFileKey: string;
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
  clearAllCompleted: () => void;
}

const DiscoverContext = createContext<DiscoverContextValue | null>(null);

const AI_POLL_INTERVAL_MS = 3000;
const AI_POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

let tempIdCounter = 0;

// --- localStorage cache helpers ---
const LS_KEY = 'prism_discover_cache';
const LS_TTL = 10 * 60 * 1000; // 10 minutes

interface CachedDiscoverState {
  timestamp: number;
  selectedTeam: string;
  cacheWarmed: boolean;
  fileMatchMap: Array<[string, PRMatchResult[]]>;
  teamFilesCache: Array<[string, FigmaSearchResult[]]>;
  overrideMap: Array<[string, PRMatchResult]>;
}

function saveToLocalStorage(state: {
  selectedTeam: string;
  cacheWarmed: boolean;
  fileMatchMap: Map<string, PRMatchResult[]>;
  teamFilesCache: Map<string, FigmaSearchResult[]>;
  overrideMap: Map<string, PRMatchResult>;
}) {
  try {
    const cached: CachedDiscoverState = {
      timestamp: Date.now(),
      selectedTeam: state.selectedTeam,
      cacheWarmed: state.cacheWarmed,
      fileMatchMap: [...state.fileMatchMap.entries()],
      teamFilesCache: [...state.teamFilesCache.entries()],
      overrideMap: [...state.overrideMap.entries()],
    };
    localStorage.setItem(LS_KEY, JSON.stringify(cached));
  } catch { /* quota exceeded or other LS error — non-fatal */ }
}

function loadFromLocalStorage(): CachedDiscoverState | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const cached: CachedDiscoverState = JSON.parse(raw);
    if (Date.now() - cached.timestamp > LS_TTL) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

// --- Override persistence via API ---
async function loadOverridesFromServer(teamId: string): Promise<Map<string, PRMatchResult>> {
  try {
    const resp = await fetch(`/api/discover/overrides?team=${encodeURIComponent(teamId)}`);
    if (!resp.ok) return new Map();
    const data = await resp.json();
    if (data.overrides && typeof data.overrides === 'object') {
      return new Map(Object.entries(data.overrides) as Array<[string, PRMatchResult]>);
    }
  } catch { /* non-fatal */ }
  return new Map();
}

async function saveOverridesToServer(teamId: string, overrides: Map<string, PRMatchResult>): Promise<void> {
  try {
    await fetch('/api/discover/overrides', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        team: teamId,
        overrides: Object.fromEntries(overrides),
      }),
    });
  } catch { /* non-fatal */ }
}

export function DiscoverProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();

  // Hydrate initial state from localStorage
  const cachedState = useRef(loadFromLocalStorage());
  const initialCache = cachedState.current;

  const [files, setFiles] = useState<FigmaSearchResult[]>([]);
  const [selectedTeam, setSelectedTeam] = useState(initialCache?.selectedTeam || '');
  const [teamFilesCache, setTeamFilesCache] = useState<Map<string, FigmaSearchResult[]>>(
    initialCache?.teamFilesCache ? new Map(initialCache.teamFilesCache) : new Map(),
  );
  const [fileMatchMap, setFileMatchMap] = useState<Map<string, PRMatchResult[]>>(
    initialCache?.fileMatchMap ? new Map(initialCache.fileMatchMap) : new Map(),
  );
  const [cacheWarmed, setCacheWarmed] = useState(initialCache?.cacheWarmed || false);
  const [overrideMap, setOverrideMap] = useState<Map<string, PRMatchResult>>(
    initialCache?.overrideMap ? new Map(initialCache.overrideMap) : new Map(),
  );
  const [pendingAnalyses, setPendingAnalyses] = useState<PendingAnalysis[]>([]);
  const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // Load overrides from Supabase on mount (merge with any localStorage overrides)
  const overridesLoadedRef = useRef(false);
  useEffect(() => {
    if (overridesLoadedRef.current || !selectedTeam) return;
    overridesLoadedRef.current = true;
    loadOverridesFromServer(selectedTeam).then(serverOverrides => {
      if (serverOverrides.size > 0) {
        setOverrideMap(prev => {
          const merged = new Map(serverOverrides);
          // Local overrides win over server (more recent)
          for (const [k, v] of prev) merged.set(k, v);
          return merged;
        });
      }
    });
  }, [selectedTeam]);

  // Persist state to localStorage on changes
  useEffect(() => {
    saveToLocalStorage({ selectedTeam, cacheWarmed, fileMatchMap, teamFilesCache, overrideMap });
  }, [selectedTeam, cacheWarmed, fileMatchMap, teamFilesCache, overrideMap]);

  // Persist overrides to Supabase when they change
  const prevOverrideRef = useRef(overrideMap);
  useEffect(() => {
    if (prevOverrideRef.current === overrideMap) return;
    prevOverrideRef.current = overrideMap;
    if (selectedTeam && overrideMap.size > 0) {
      saveOverridesToServer(selectedTeam, overrideMap);
    }
  }, [overrideMap, selectedTeam]);

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
    const tempId = `pending-${Date.now()}-${tempIdCounter++}`;
    const pending: PendingAnalysis = {
      tempId,
      figmaFileKey: file.fileKey,
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

  const clearAllCompleted = useCallback(() => {
    setPendingAnalyses(prev => prev.filter(p => p.status === 'running'));
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
        pendingAnalyses, startAnalysis, clearPending, clearAllCompleted,
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
