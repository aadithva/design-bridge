import { useState } from 'react';
import { Check, X, Loader2, Eye, EyeOff } from 'lucide-react';
import { useSettings } from '../lib/SettingsContext';
import { getAdoOrgUrl } from '../lib/settings';

function PasswordInput({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (val: string) => void;
  placeholder: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl bg-slate-50 pl-4 pr-10 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-slate-300"
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
        tabIndex={-1}
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export function SettingsPanel() {
  const { settings, updateSettings } = useSettings();

  // Local draft state so user can edit and save explicitly
  const [figmaPat, setFigmaPat] = useState(settings.figmaPat);
  const [figmaTeamIds, setFigmaTeamIds] = useState(settings.figmaTeamIds || '');
  const [adoPat, setAdoPat] = useState(settings.adoPat);
  const [adoOrgUrl, setAdoOrgUrl] = useState(settings.adoOrgUrl || 'https://dev.azure.com/office');
  const [adoDefaultProject, setAdoDefaultProject] = useState(settings.adoDefaultProject || '');

  // Validation state
  const [figmaValid, setFigmaValid] = useState<boolean | null>(null);
  const [figmaUser, setFigmaUser] = useState<{ handle: string; email: string } | null>(null);
  const [figmaValidating, setFigmaValidating] = useState(false);
  const [figmaError, setFigmaError] = useState('');
  const [figmaSaved, setFigmaSaved] = useState(false);

  const [adoValid, setAdoValid] = useState<boolean | null>(null);
  const [adoValidating, setAdoValidating] = useState(false);
  const [adoError, setAdoError] = useState('');
  const [adoSaved, setAdoSaved] = useState(false);

  const saveFigma = () => {
    updateSettings({ figmaPat, figmaTeamIds });
    setFigmaSaved(true);
    setTimeout(() => setFigmaSaved(false), 2000);
  };

  const saveAdo = () => {
    updateSettings({ adoPat, adoOrgUrl, adoDefaultProject });
    setAdoSaved(true);
    setTimeout(() => setAdoSaved(false), 2000);
  };

  const testFigma = async () => {
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
      const orgUrl = adoOrgUrl.trim() || getAdoOrgUrl(settings);
      const resp = await fetch('/api/validate/ado-pat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adoOrgUrl: orgUrl, adoPat }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await resp.json();
      setAdoValid(data.valid);
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

  const figmaDirty = figmaPat !== settings.figmaPat || figmaTeamIds !== (settings.figmaTeamIds || '');
  const adoDirty = adoPat !== settings.adoPat || adoOrgUrl !== (settings.adoOrgUrl || 'https://dev.azure.com/office') || adoDefaultProject !== (settings.adoDefaultProject || '');

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Figma Integration */}
      <div className="rounded-2xl bg-white shadow-soft p-8">
        <h3 className="text-lg font-semibold text-slate-900">Figma Integration</h3>

        <div className="flex flex-col gap-5 mt-6">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sf-figma-pat" className="text-sm font-medium text-slate-900">
              Figma Personal Access Token
            </label>
            <PasswordInput
              id="sf-figma-pat"
              value={figmaPat}
              onChange={v => { setFigmaPat(v); setFigmaValid(null); }}
              placeholder="figd_..."
            />
            <p className="text-xs text-slate-400">Generate a token from your Figma account settings.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="sf-team-ids" className="text-sm font-medium text-slate-900">
              Team IDs
            </label>
            <input
              id="sf-team-ids"
              type="text"
              value={figmaTeamIds}
              onChange={e => setFigmaTeamIds(e.target.value)}
              placeholder="12345678901234567"
              className="w-full rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-slate-300"
            />
            <p className="text-xs text-slate-400">To find your team ID, open the team in Figma and copy the number in the URL after /team/.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={saveFigma}
              disabled={!figmaDirty && !figmaSaved}
              className="px-5 py-2 text-sm rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium"
            >
              {figmaSaved ? 'Saved!' : 'Save Changes'}
            </button>
            <button
              onClick={testFigma}
              disabled={!figmaPat || figmaValidating}
              className="px-5 py-2 text-sm rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors font-medium"
            >
              {figmaValidating && <Loader2 className="h-4 w-4 animate-spin inline mr-1.5" />}
              Test Connection
            </button>
            {figmaValid === true && (
              <span className="flex items-center gap-1 text-emerald-600 text-sm"><Check className="h-4 w-4" /> Connected</span>
            )}
            {figmaValid === false && (
              <span className="flex items-center gap-1 text-rose-600 text-sm"><X className="h-4 w-4" /> {figmaError || 'Invalid'}</span>
            )}
          </div>
          {figmaUser && (
            <p className="text-sm text-slate-400 -mt-2">Authenticated as: {figmaUser.handle} ({figmaUser.email})</p>
          )}
        </div>
      </div>

      {/* Azure DevOps Integration */}
      <div className="rounded-2xl bg-white shadow-soft p-8">
        <h3 className="text-lg font-semibold text-slate-900">Azure DevOps Integration</h3>

        <div className="flex flex-col gap-5 mt-6">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sf-ado-pat" className="text-sm font-medium text-slate-900">
              Azure DevOps PAT
            </label>
            <PasswordInput
              id="sf-ado-pat"
              value={adoPat}
              onChange={v => { setAdoPat(v); setAdoValid(null); }}
              placeholder="your-ado-pat"
            />
            <p className="text-xs text-slate-400">Generate a Personal Access Token from Azure DevOps settings.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="sf-ado-org" className="text-sm font-medium text-slate-900">
              Organization URL
            </label>
            <input
              id="sf-ado-org"
              type="text"
              value={adoOrgUrl}
              onChange={e => setAdoOrgUrl(e.target.value)}
              placeholder="https://dev.azure.com/yourorg"
              className="w-full rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-slate-300"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="sf-ado-project" className="text-sm font-medium text-slate-900">
              Default Project
            </label>
            <input
              id="sf-ado-project"
              type="text"
              value={adoDefaultProject}
              onChange={e => setAdoDefaultProject(e.target.value)}
              placeholder="MyProject"
              className="w-full rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-200 placeholder:text-slate-300"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={saveAdo}
              disabled={!adoDirty && !adoSaved}
              className="px-5 py-2 text-sm rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors font-medium"
            >
              {adoSaved ? 'Saved!' : 'Save Changes'}
            </button>
            <button
              onClick={validateAdo}
              disabled={!adoPat || adoValidating}
              className="px-5 py-2 text-sm rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-40 transition-colors font-medium"
            >
              {adoValidating && <Loader2 className="h-4 w-4 animate-spin inline mr-1.5" />}
              Validate Connection
            </button>
            {adoValid === true && (
              <span className="flex items-center gap-1 text-emerald-600 text-sm"><Check className="h-4 w-4" /> Connected</span>
            )}
            {adoValid === false && (
              <span className="flex items-center gap-1 text-rose-600 text-sm"><X className="h-4 w-4" /> {adoError || 'Invalid'}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
