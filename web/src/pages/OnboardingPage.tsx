import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Layers, Check, X, ArrowRight, Loader2 } from 'lucide-react';
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center">
            <Layers className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900">Design Bridge</h1>
        </div>
        <div className="rounded-2xl bg-white shadow-soft p-8 max-w-md w-full">
          <h2 className="text-2xl font-semibold text-slate-900">You're all set!</h2>
          <p className="mt-3 text-slate-500">Your credentials are configured.</p>
          <div className="flex justify-end mt-6">
            <button
              onClick={() => navigate('/discover')}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-soft-sm font-medium text-sm"
            >
              Go to Discover <ArrowRight className="h-4 w-4" />
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
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
      <div className="flex items-center gap-3 mb-8">
        <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center">
          <Layers className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Design Bridge</h1>
      </div>
      <div className="rounded-2xl bg-white shadow-soft p-8 max-w-md w-full">
        <h2 className="text-2xl font-semibold text-slate-900">Welcome</h2>
        <p className="text-sm text-slate-500 mt-1">Connect your Figma and Azure DevOps accounts to get started.</p>

        <div className="flex flex-col gap-6 mt-6">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="onboardFigmaPat" className="text-sm font-medium text-slate-700">
              Step 1: Figma Personal Access Token
            </label>
            <input
              id="onboardFigmaPat"
              type="password"
              value={figmaPat}
              onChange={e => { setFigmaPat(e.target.value); setFigmaValid(null); }}
              placeholder="figd_..."
              disabled={step > 1}
              className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 disabled:text-slate-400 placeholder:text-slate-300"
            />
            <div className="flex gap-3 items-center mt-1">
              <button
                onClick={validateFigma}
                disabled={!figmaPat || figmaValidating || step > 1}
                className="px-4 py-1.5 text-sm rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors"
              >
                {figmaValidating && <Loader2 className="h-4 w-4 animate-spin inline mr-1" />}
                Validate
              </button>
              {figmaValid === true && (
                <span className="flex items-center gap-1 text-emerald-600 text-sm"><Check className="h-4 w-4" /> Valid</span>
              )}
              {figmaValid === false && (
                <span className="flex items-center gap-1 text-rose-600 text-sm"><X className="h-4 w-4" /> {figmaError || 'Invalid'}</span>
              )}
            </div>
            {figmaUser && (
              <span className="text-sm text-slate-400">Authenticated as: {figmaUser.handle} ({figmaUser.email})</span>
            )}
          </div>

          {step >= 2 && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="onboardAdoPat" className="text-sm font-medium text-slate-700">
                Step 2: ADO Personal Access Token
              </label>
              <input
                id="onboardAdoPat"
                type="password"
                value={adoPat}
                onChange={e => { setAdoPat(e.target.value); setAdoValid(null); }}
                placeholder="your-ado-pat"
                className="rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-slate-300"
              />
              <div className="flex gap-3 items-center mt-1">
                <button
                  onClick={validateAdo}
                  disabled={!adoPat || adoValidating}
                  className="px-4 py-1.5 text-sm rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors"
                >
                  {adoValidating && <Loader2 className="h-4 w-4 animate-spin inline mr-1" />}
                  Validate
                </button>
                {adoValid === true && (
                  <span className="flex items-center gap-1 text-emerald-600 text-sm"><Check className="h-4 w-4" /> Valid</span>
                )}
                {adoValid === false && (
                  <span className="flex items-center gap-1 text-rose-600 text-sm"><X className="h-4 w-4" /> {adoError || 'Invalid'}</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
