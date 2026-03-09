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

  // When a pending analysis completes, navigate to its report and clean up
  useEffect(() => {
    const completed = pendingAnalyses.find(p => p.status === 'completed' && p.result);
    if (completed?.result) {
      clearPending(completed.tempId);
      navigate(`/analysis/${completed.result.id}`);
    }
  }, [pendingAnalyses]);

  // Tick every second to update elapsed time while pending analyses exist
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
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        <span className="ml-2 text-slate-500">Loading reports...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-2xl font-semibold text-slate-900">Reports</h2>

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {failedPending.map(p => (
        <div key={p.tempId} className="rounded-xl bg-red-50 p-4 text-sm text-red-700 flex items-center justify-between">
          <span>Analysis failed for PR #{p.prId} "{p.prTitle}": {p.error}</span>
          <button
            onClick={() => clearPending(p.tempId)}
            className="text-xs text-red-500 hover:text-red-700 underline ml-4"
          >
            Dismiss
          </button>
        </div>
      ))}

      {hasPending && (
        <div className="rounded-2xl bg-white shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4 font-medium">PR</th>
                <th className="px-6 py-4 font-medium">Figma Page</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Findings</th>
                <th className="px-6 py-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingAnalyses.filter(p => p.status === 'running').map(p => (
                <tr key={p.tempId} className="bg-blue-50/40">
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{p.prTitle}</div>
                    <div className="text-xs text-slate-400 mt-0.5">PR #{p.prId}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{p.figmaFileName}</td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-1.5 text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full text-xs font-medium">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {p.progressPhase === 'ai-review' ? 'Running AI review...' : 'Extracting design specs...'}
                    </span>
                    <span className="ml-2 text-xs text-slate-400">{formatElapsed(p.startedAt)}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-slate-300">-</span>
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(p.startedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {analyses.length === 0 && !hasPending && !error && (
        <div className="text-center py-20 text-slate-400">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-slate-500">No analysis reports yet.</p>
          <p className="text-sm mt-1">Run an analysis from the Discover tab to see results here.</p>
        </div>
      )}

      {analyses.length > 0 && (
        <div className="rounded-2xl bg-white shadow-soft overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4 font-medium">PR</th>
                <th className="px-6 py-4 font-medium">Figma Page</th>
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium">Findings</th>
                <th className="px-6 py-4 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {analyses.map(a => (
                <tr
                  key={a.id}
                  onClick={() => navigate(`/analysis/${a.id}`)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                >
                  <td className="px-6 py-4">
                    <div className="font-medium text-slate-900">{a.prTitle || 'Untitled'}</div>
                    {a.prId > 0 && <div className="text-xs text-slate-400 mt-0.5">PR #{a.prId}</div>}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{a.figmaPageName || '-'}</td>
                  <td className="px-6 py-4">
                    {a.status === 'completed' ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full text-xs font-medium">
                        <CheckCircle2 className="h-3 w-3" /> Completed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full text-xs font-medium">
                        <AlertCircle className="h-3 w-3" /> Failed
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {a.summary ? (
                      <div className="flex items-center gap-3 text-xs">
                        {a.summary.errors > 0 && (
                          <span className="flex items-center gap-1 text-rose-600">
                            <AlertCircle className="h-3 w-3" /> {a.summary.errors}
                          </span>
                        )}
                        {a.summary.warnings > 0 && (
                          <span className="flex items-center gap-1 text-amber-600">
                            <AlertTriangle className="h-3 w-3" /> {a.summary.warnings}
                          </span>
                        )}
                        {a.summary.info > 0 && (
                          <span className="flex items-center gap-1 text-blue-600">
                            <Info className="h-3 w-3" /> {a.summary.info}
                          </span>
                        )}
                        {a.summary.passes > 0 && (
                          <span className="flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="h-3 w-3" /> {a.summary.passes}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-300">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-500">
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
