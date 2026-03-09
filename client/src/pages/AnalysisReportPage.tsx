import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { getAnalysis } from '../lib/api';
import { AnalysisReport } from '../components/AnalysisReport';
import type { AnalysisResult } from '../types';

const POLL_INTERVAL_MS = 3000;

export function AnalysisReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!id) return;
    getAnalysis(id)
      .then(setResult)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id || !result) return;

    const shouldPoll =
      result.aiSummaryStatus === 'pending' || result.aiSummaryStatus === 'generating';

    if (!shouldPoll) {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    pollRef.current = setInterval(() => {
      getAnalysis(id)
        .then((updated) => {
          setResult(updated);
          if (
            updated.aiSummaryStatus !== 'pending' &&
            updated.aiSummaryStatus !== 'generating'
          ) {
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        })
        .catch(() => {});
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [id, result?.aiSummaryStatus]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
        <span className="ml-2 text-ink-muted text-xs">Loading analysis...</span>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="flex flex-col gap-4">
        <button
          onClick={() => navigate('/reports')}
          className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="rounded bg-sev-error/10 border border-sev-error/20 p-3 text-xs text-sev-error">
          {error || 'Analysis not found'}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => navigate('/reports')}
        className="inline-flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink transition-colors mb-5"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>
      <AnalysisReport result={result} />
    </div>
  );
}
