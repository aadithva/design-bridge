import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Check, X, ArrowRight, Loader2, Layers } from 'lucide-react';
import { useSettings } from '../lib/SettingsContext';
import { getAdoOrgUrl } from '../lib/settings';

export function OnboardingPage() {
  const navigate = useNavigate();
  const { settings, updateSettings, isConfigured } = useSettings();
  const [step, setStep] = useState(1);
  const [figmaPat, setFigmaPat] = useState(settings.figmaPat);
  const [adoPat, setAdoPat] = useState(settings.adoPat);
  const [figmaValid, setFigmaValid] = useState<boolean | null>(null);
  const [figmaUser, setFigmaUser] = useState<{ handle: string; email: string } | null>(null);
  const [figmaValidating, setFigmaValidating] = useState(false);
  const [figmaError, setFigmaError] = useState('');
  const [adoValid, setAdoValid] = useState<boolean | null>(null);
  const [adoValidating, setAdoValidating] = useState(false);
  const [adoError, setAdoError] = useState('');

  if (isConfigured) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-panel-base p-6">
        <div className="flex items-center gap-3 mb-6">
          <img src="/prism-logo.png" alt="Prism" className="h-8 w-8 object-contain" />
          <h1 className="text-lg font-semibold tracking-widest uppercase text-ink">Prism</h1>
        </div>
        <div className="w-48 prism-bar rounded-full mb-6" />
        <div className="rounded bg-panel-surface border border-border p-8 max-w-md w-full">
          <h2 className="text-sm font-semibold tracking-wider uppercase text-ink">System Ready</h2>
          <p className="mt-2 text-xs text-ink-muted">Credentials configured.</p>
          <div className="flex justify-end mt-6">
            <button
              onClick={() => navigate('/discover')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded bg-accent/20 text-accent-bright hover:bg-accent/30 transition-colors text-xs font-medium tracking-wider uppercase"
            >
              Enter <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const validateFigma = async () => {
    setFigmaValidating(true);
    setFigmaValid(null);
    setFigmaUser(null);
    setFigmaError('');
    try {
      const resp = await fetch('/api/validate/figma-pat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ figmaPat }),
      });
      const data = await resp.json();
      setFigmaValid(data.valid);
      if (data.valid && data.user) setFigmaUser(data.user);
      if (data.valid) {
        updateSettings({ figmaPat });
        setStep(2);
      }
      if (!data.valid) setFigmaError(data.error || 'Invalid PAT');
    } catch (err) {
      setFigmaValid(false);
      setFigmaError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setFigmaValidating(false);
    }
  };

  const validateAdo = async () => {
    setAdoValidating(true);
    setAdoValid(null);
    setAdoError('');
    try {
      const resp = await fetch('/api/validate/ado-pat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adoOrgUrl: getAdoOrgUrl(settings), adoPat }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await resp.json();
      setAdoValid(data.valid);
      if (data.valid) {
        updateSettings({ adoPat });
        navigate('/discover');
      }
      if (!data.valid) setAdoError(data.error || 'Validation failed');
    } catch (err) {
      setAdoValid(false);
      setAdoError(
        err instanceof Error && err.name === 'TimeoutError'
          ? 'Request timed out'
          : err instanceof Error ? err.message : 'Network error',
      );
    } finally {
      setAdoValidating(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-panel-base p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="h-8 w-8 rounded bg-panel-surface border border-border flex items-center justify-center">
          <Layers className="h-3.5 w-3.5 text-accent-bright" />
        </div>
        <h1 className="text-lg font-semibold tracking-widest uppercase text-ink">Prism</h1>
      </div>
      <div className="w-48 prism-bar rounded-full mb-6" />
      <div className="rounded bg-panel-surface border border-border p-8 max-w-md w-full">
        <h2 className="text-sm font-semibold tracking-wider uppercase text-ink">Initialize</h2>
        <p className="text-xs text-ink-muted mt-1">Connect Figma and Azure DevOps.</p>

        <div className="flex flex-col gap-6 mt-6">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="onboardFigmaPat" className="text-[10px] font-medium tracking-widest uppercase text-ink-secondary">
              01 / Figma PAT
            </label>
            <input
              id="onboardFigmaPat"
              type="password"
              value={figmaPat}
              onChange={e => { setFigmaPat(e.target.value); setFigmaValid(null); }}
              placeholder="figd_..."
              disabled={step > 1}
              className="rounded bg-panel-base border border-border px-3 py-2 text-xs text-ink outline-none focus:border-accent/40 disabled:text-ink-muted placeholder:text-ink-faint"
            />
            <div className="flex gap-3 items-center mt-1">
              <button
                onClick={validateFigma}
                disabled={!figmaPat || figmaValidating || step > 1}
                className="px-3 py-1.5 text-[10px] tracking-wider uppercase rounded bg-panel-hover text-ink-secondary hover:bg-panel-active disabled:opacity-40 transition-colors"
              >
                {figmaValidating && <Loader2 className="h-3 w-3 animate-spin inline mr-1" />}
                Validate
              </button>
              {figmaValid === true && (
                <span className="flex items-center gap-1 text-sev-pass text-[10px] tracking-wider uppercase"><Check className="h-3 w-3" /> Valid</span>
              )}
              {figmaValid === false && (
                <span className="flex items-center gap-1 text-sev-error text-[10px]"><X className="h-3 w-3" /> {figmaError || 'Invalid'}</span>
              )}
            </div>
            {figmaUser && (
              <span className="text-[10px] text-ink-muted">{figmaUser.handle} ({figmaUser.email})</span>
            )}
          </div>

          {step >= 2 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="onboardAdoPat" className="text-[10px] font-medium tracking-widest uppercase text-ink-secondary">
                02 / ADO PAT
              </label>
              <input
                id="onboardAdoPat"
                type="password"
                value={adoPat}
                onChange={e => { setAdoPat(e.target.value); setAdoValid(null); }}
                placeholder="your-ado-pat"
                className="rounded bg-panel-base border border-border px-3 py-2 text-xs text-ink outline-none focus:border-accent/40 placeholder:text-ink-faint"
              />
              <div className="flex gap-3 items-center mt-1">
                <button
                  onClick={validateAdo}
                  disabled={!adoPat || adoValidating}
                  className="px-3 py-1.5 text-[10px] tracking-wider uppercase rounded bg-panel-hover text-ink-secondary hover:bg-panel-active disabled:opacity-40 transition-colors"
                >
                  {adoValidating && <Loader2 className="h-3 w-3 animate-spin inline mr-1" />}
                  Validate
                </button>
                {adoValid === true && (
                  <span className="flex items-center gap-1 text-sev-pass text-[10px] tracking-wider uppercase"><Check className="h-3 w-3" /> Valid</span>
                )}
                {adoValid === false && (
                  <span className="flex items-center gap-1 text-sev-error text-[10px]"><X className="h-3 w-3" /> {adoError || 'Invalid'}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
