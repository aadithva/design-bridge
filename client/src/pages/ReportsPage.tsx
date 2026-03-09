import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, FileText, AlertTriangle, AlertCircle, Info, CheckCircle2 } from 'lucide-react';
import { useDiscover } from '../lib/DiscoverContext';
import { listAnalyses } from '../lib/api';
import type { AnalysisResult } from '../types';

function formatElapsed(startedAt: string): string {
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins}m ${secs}s`;
}

export function ReportsPage() {
  const navigate = useNavigate();
  const { pendingAnalyses, clearPending } = useDiscover();
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [, setTick] = useState(0);

  useEffect(() => {
    listAnalyses()
      .then(setAnalyses)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const completed = pendingAnalyses.find(p => p.status === 'completed' && p.result);
    if (completed?.result) {
      clearPending(completed.tempId);
      navigate(`/analysis/${completed.result.id}`);
    }
  }, [pendingAnalyses]);

  const hasPending = pendingAnalyses.some(p => p.status === 'running');
  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasPending]);
  const failedPending = pendingAnalyses.filter(p => p.status === 'failed');

  if (loading && !hasPending) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
        <span className="ml-2 text-ink-muted text-xs">Loading reports...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-xs font-semibold tracking-widest uppercase text-ink-secondary">Reports</h2>

      {error && (
        <div className="rounded bg-sev-error/10 border border-sev-error/20 p-3 text-xs text-sev-error">{error}</div>
      )}

      {failedPending.map(p => (
        <div key={p.tempId} className="rounded bg-sev-error/10 border border-sev-error/20 p-3 text-xs text-sev-error flex items-center justify-between">
          <span>Analysis failed for PR #{p.prId} "{p.prTitle}": {p.error}</span>
          <button
            onClick={() => clearPending(p.tempId)}
            className="text-[10px] text-sev-error/70 hover:text-sev-error underline ml-4"
          >
            Dismiss
          </button>
        </div>
      ))}

      {hasPending && (
        <div className="rounded bg-panel-surface border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] text-ink-muted tracking-widest uppercase border-b border-border">
                <th className="px-5 py-3 font-medium">PR</th>
                <th className="px-5 py-3 font-medium">Figma</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Findings</th>
                <th className="px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {pendingAnalyses.filter(p => p.status === 'running').map(p => (
                <tr key={p.tempId} className="bg-accent-dim/30">
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink">{p.prTitle}</div>
                    <div className="text-[10px] text-ink-muted mt-0.5">PR #{p.prId}</div>
                  </td>
                  <td className="px-5 py-3 text-ink-secondary">{p.figmaFileName}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1.5 text-accent-bright bg-accent-dim px-2 py-0.5 rounded text-[10px] font-medium tracking-wider uppercase border border-accent/20">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {p.progressPhase === 'ai-review' ? 'AI Review' : 'Extracting'}
                    </span>
                    <span className="ml-2 text-[10px] text-ink-muted">{formatElapsed(p.startedAt)}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="text-ink-faint">-</span>
                  </td>
                  <td className="px-5 py-3 text-ink-muted">
                    {new Date(p.startedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {analyses.length === 0 && !hasPending && !error && (
        <div className="text-center py-20 text-ink-muted">
          <FileText className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-xs">No analysis reports yet.</p>
          <p className="text-[10px] mt-1 text-ink-faint">Run an analysis from Discover.</p>
        </div>
      )}

      {analyses.length > 0 && (
        <div className="rounded bg-panel-surface border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] text-ink-muted tracking-widest uppercase border-b border-border">
                <th className="px-5 py-3 font-medium">PR</th>
                <th className="px-5 py-3 font-medium">Figma</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Findings</th>
                <th className="px-5 py-3 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {analyses.map(a => (
                <tr
                  key={a.id}
                  onClick={() => navigate(`/analysis/${a.id}`)}
                  className="hover:bg-panel-hover cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-ink">{a.prTitle || 'Untitled'}</div>
                    {a.prId > 0 && <div className="text-[10px] text-ink-muted mt-0.5">PR #{a.prId}</div>}
                  </td>
                  <td className="px-5 py-3 text-ink-secondary">{a.figmaPageName || '-'}</td>
                  <td className="px-5 py-3">
                    {a.status === 'completed' ? (
                      <span className="inline-flex items-center gap-1 text-sev-pass bg-sev-pass/10 px-2 py-0.5 rounded text-[10px] font-medium tracking-wider uppercase border border-sev-pass/20">
                        <CheckCircle2 className="h-3 w-3" /> Done
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sev-error bg-sev-error/10 px-2 py-0.5 rounded text-[10px] font-medium tracking-wider uppercase border border-sev-error/20">
                        <AlertCircle className="h-3 w-3" /> Failed
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {a.summary ? (
                      <div className="flex items-center gap-3 text-[10px]">
                        {a.summary.errors > 0 && (
                          <span className="flex items-center gap-1 text-sev-error">
                            <AlertCircle className="h-3 w-3" /> {a.summary.errors}
                          </span>
                        )}
                        {a.summary.warnings > 0 && (
                          <span className="flex items-center gap-1 text-sev-warning">
                            <AlertTriangle className="h-3 w-3" /> {a.summary.warnings}
                          </span>
                        )}
                        {a.summary.info > 0 && (
                          <span className="flex items-center gap-1 text-sev-info">
                            <Info className="h-3 w-3" /> {a.summary.info}
                          </span>
                        )}
                        {a.summary.passes > 0 && (
                          <span className="flex items-center gap-1 text-sev-pass">
                            <CheckCircle2 className="h-3 w-3" /> {a.summary.passes}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-ink-faint">-</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-ink-muted">
                    {a.createdAt ? new Date(a.createdAt).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
