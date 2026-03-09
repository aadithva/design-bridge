import { useState, useCallback } from 'react';
import { Play, Loader2, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router';
import { analyze, lookupPR } from '../lib/api';
import { useSettings } from '../lib/SettingsContext';
import { getAdoOrgUrl } from '../lib/settings';
import type { AnalysisResult } from '../types';
import { AnalysisReport } from '../components/AnalysisReport';

export function ReviewPage() {
  const { settings } = useSettings();
  const navigate = useNavigate();

  const [figmaUrl, setFigmaUrl] = useState('');
  const [prId, setPrId] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const canRun = figmaUrl.includes('figma.com/') && settings.figmaPat;

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError('');
    setResult(null);

    try {
      const adoOrgUrl = getAdoOrgUrl(settings);
      let adoProject = settings.adoDefaultProject || undefined;
      let adoRepoId: string | undefined;
      const numericPrId = prId ? Number(prId) : undefined;

      // If PR ID provided, resolve its repo context
      if (numericPrId && settings.adoPat) {
        try {
          const prInfo = await lookupPR({
            adoOrgUrl,
            adoPat: settings.adoPat,
            project: adoProject || 'Office',
            pullRequestId: numericPrId,
          });
          adoProject = prInfo.project;
          adoRepoId = prInfo.repositoryId;
        } catch {
          // Proceed without PR context — Figma-only analysis will still work
        }
      }

      const analysisResult = await analyze({
        figmaUrl,
        figmaPat: settings.figmaPat,
        prId: numericPrId,
        adoOrgUrl,
        adoProject,
        adoRepoId,
        adoPat: settings.adoPat || undefined,
      });

      setResult(analysisResult);
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
    } finally {
      setRunning(false);
    }
  }, [figmaUrl, prId, settings]);

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-xs font-semibold tracking-widest uppercase text-ink-secondary">Review</h2>

      {/* Input card */}
      <div className="rounded bg-panel-surface border border-border p-5 relative overflow-hidden">
        <div className="absolute top-0 left-0 right-0 prism-bar" />

        <div className="flex flex-col gap-4 mt-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] tracking-widest uppercase text-ink-muted font-medium">
              Figma URL <span className="text-sev-error">*</span>
            </label>
            <input
              type="text"
              value={figmaUrl}
              onChange={e => setFigmaUrl(e.target.value)}
              placeholder="https://www.figma.com/design/ABC123..."
              className="rounded bg-panel-base border border-border px-3 py-2 text-xs text-ink outline-none focus:border-accent/40 placeholder:text-ink-faint"
              disabled={running}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] tracking-widest uppercase text-ink-muted font-medium">
              Pull Request ID <span className="text-ink-faint">(optional)</span>
            </label>
            <input
              type="text"
              value={prId}
              onChange={e => setPrId(e.target.value.replace(/\D/g, ''))}
              placeholder="e.g. 4156005"
              className="rounded bg-panel-base border border-border px-3 py-2 text-xs text-ink outline-none focus:border-accent/40 placeholder:text-ink-faint w-48"
              disabled={running}
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRun}
              disabled={!canRun || running}
              className="flex items-center gap-2 px-4 py-2 rounded text-xs font-medium tracking-wider uppercase transition-colors bg-accent text-panel-surface hover:bg-accent-bright disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {running ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {running ? 'Analyzing...' : 'Run Review'}
            </button>

            {result && (
              <button
                onClick={() => navigate(`/analysis/${result.id}`)}
                className="flex items-center gap-1.5 px-3 py-2 rounded text-xs text-ink-muted hover:text-ink transition-colors border border-border hover:border-border-emphasis"
              >
                <ExternalLink className="h-3 w-3" />
                Full Report
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded bg-sev-error/10 border border-sev-error/20 p-3 text-xs text-sev-error">
          {error}
        </div>
      )}

      {result && <AnalysisReport result={result} />}
    </div>
  );
}
