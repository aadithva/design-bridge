import { useState } from 'react';
import { Check, X, Loader2, Eye, EyeOff, Sun, Moon } from 'lucide-react';
import { clsx } from 'clsx';
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
        className="w-full rounded bg-panel-base border border-border pl-3 pr-9 py-2 text-xs text-ink outline-none focus:border-accent/40 placeholder:text-ink-faint"
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-secondary transition-colors"
        tabIndex={-1}
      >
        {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function SettingsPanel() {
  const { settings, updateSettings } = useSettings();

  const [figmaPat, setFigmaPat] = useState(settings.figmaPat);
  const [figmaTeamIds, setFigmaTeamIds] = useState(settings.figmaTeamIds || '');
  const [adoPat, setAdoPat] = useState(settings.adoPat);
  const [adoOrgUrl, setAdoOrgUrl] = useState(settings.adoOrgUrl || 'https://dev.azure.com/office');
  const [adoDefaultProject, setAdoDefaultProject] = useState(settings.adoDefaultProject || '');

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

  const isDark = settings.theme === 'dark';

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      {/* Theme Toggle */}
      <div className="rounded bg-panel-surface border border-border p-6">
        <h3 className="text-xs font-semibold tracking-wider uppercase text-ink">Appearance</h3>

        <div className="flex items-center gap-4 mt-5">
          <span className="text-[10px] font-medium tracking-widest uppercase text-ink-secondary">Theme</span>
          <div className="flex rounded border border-border overflow-hidden">
            <button
              onClick={() => updateSettings({ theme: 'light' })}
              className={clsx(
                'flex items-center gap-1.5 px-3.5 py-2 text-[10px] tracking-wider uppercase font-medium transition-colors',
                !isDark
                  ? 'bg-accent-dim text-ink'
                  : 'bg-panel-base text-ink-muted hover:text-ink-secondary',
              )}
            >
              <Sun className="h-3 w-3" />
              Light
            </button>
            <button
              onClick={() => updateSettings({ theme: 'dark' })}
              className={clsx(
                'flex items-center gap-1.5 px-3.5 py-2 text-[10px] tracking-wider uppercase font-medium transition-colors border-l border-border',
                isDark
                  ? 'bg-accent-dim text-ink'
                  : 'bg-panel-base text-ink-muted hover:text-ink-secondary',
              )}
            >
              <Moon className="h-3 w-3" />
              Dark
            </button>
          </div>
        </div>
      </div>

      {/* Figma Integration */}
      <div className="rounded bg-panel-surface border border-border p-6">
        <h3 className="text-xs font-semibold tracking-wider uppercase text-ink">Figma</h3>

        <div className="flex flex-col gap-4 mt-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sf-figma-pat" className="text-[10px] font-medium tracking-widest uppercase text-ink-secondary">
              Personal Access Token
            </label>
            <PasswordInput
              id="sf-figma-pat"
              value={figmaPat}
              onChange={v => { setFigmaPat(v); setFigmaValid(null); }}
              placeholder="figd_..."
            />
            <p className="text-[10px] text-ink-faint">Generate from Figma account settings.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="sf-team-ids" className="text-[10px] font-medium tracking-widest uppercase text-ink-secondary">
              Team IDs
            </label>
            <input
              id="sf-team-ids"
              type="text"
              value={figmaTeamIds}
              onChange={e => setFigmaTeamIds(e.target.value)}
              placeholder="12345678901234567"
              className="w-full rounded bg-panel-base border border-border px-3 py-2 text-xs text-ink outline-none focus:border-accent/40 placeholder:text-ink-faint"
            />
            <p className="text-[10px] text-ink-faint">Find in your Figma team URL after /team/.</p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={saveFigma}
              disabled={!figmaDirty && !figmaSaved}
              className="px-4 py-1.5 text-[10px] tracking-wider uppercase rounded bg-accent/20 text-accent-bright hover:bg-accent/30 disabled:opacity-40 transition-colors font-medium"
            >
              {figmaSaved ? 'Saved' : 'Save'}
            </button>
            <button
              onClick={testFigma}
              disabled={!figmaPat || figmaValidating}
              className="px-4 py-1.5 text-[10px] tracking-wider uppercase rounded bg-panel-hover text-ink-secondary hover:bg-panel-active disabled:opacity-40 transition-colors font-medium"
            >
              {figmaValidating && <Loader2 className="h-3 w-3 animate-spin inline mr-1" />}
              Test
            </button>
            {figmaValid === true && (
              <span className="flex items-center gap-1 text-sev-pass text-[10px] tracking-wider"><Check className="h-3 w-3" /> OK</span>
            )}
            {figmaValid === false && (
              <span className="flex items-center gap-1 text-sev-error text-[10px]"><X className="h-3 w-3" /> {figmaError || 'Invalid'}</span>
            )}
          </div>
          {figmaUser && (
            <p className="text-[10px] text-ink-muted -mt-1">{figmaUser.handle} ({figmaUser.email})</p>
          )}
        </div>
      </div>

      {/* Azure DevOps Integration */}
      <div className="rounded bg-panel-surface border border-border p-6">
        <h3 className="text-xs font-semibold tracking-wider uppercase text-ink">Azure DevOps</h3>

        <div className="flex flex-col gap-4 mt-5">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="sf-ado-pat" className="text-[10px] font-medium tracking-widest uppercase text-ink-secondary">
              PAT
            </label>
            <PasswordInput
              id="sf-ado-pat"
              value={adoPat}
              onChange={v => { setAdoPat(v); setAdoValid(null); }}
              placeholder="your-ado-pat"
            />
            <p className="text-[10px] text-ink-faint">Generate from Azure DevOps settings.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="sf-ado-org" className="text-[10px] font-medium tracking-widest uppercase text-ink-secondary">
              Org URL
            </label>
            <input
              id="sf-ado-org"
              type="text"
              value={adoOrgUrl}
              onChange={e => setAdoOrgUrl(e.target.value)}
              placeholder="https://dev.azure.com/yourorg"
              className="w-full rounded bg-panel-base border border-border px-3 py-2 text-xs text-ink outline-none focus:border-accent/40 placeholder:text-ink-faint"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="sf-ado-project" className="text-[10px] font-medium tracking-widest uppercase text-ink-secondary">
              Default Project
            </label>
            <input
              id="sf-ado-project"
              type="text"
              value={adoDefaultProject}
              onChange={e => setAdoDefaultProject(e.target.value)}
              placeholder="MyProject"
              className="w-full rounded bg-panel-base border border-border px-3 py-2 text-xs text-ink outline-none focus:border-accent/40 placeholder:text-ink-faint"
            />
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={saveAdo}
              disabled={!adoDirty && !adoSaved}
              className="px-4 py-1.5 text-[10px] tracking-wider uppercase rounded bg-accent/20 text-accent-bright hover:bg-accent/30 disabled:opacity-40 transition-colors font-medium"
            >
              {adoSaved ? 'Saved' : 'Save'}
            </button>
            <button
              onClick={validateAdo}
              disabled={!adoPat || adoValidating}
              className="px-4 py-1.5 text-[10px] tracking-wider uppercase rounded bg-panel-hover text-ink-secondary hover:bg-panel-active disabled:opacity-40 transition-colors font-medium"
            >
              {adoValidating && <Loader2 className="h-3 w-3 animate-spin inline mr-1" />}
              Validate
            </button>
            {adoValid === true && (
              <span className="flex items-center gap-1 text-sev-pass text-[10px] tracking-wider"><Check className="h-3 w-3" /> OK</span>
            )}
            {adoValid === false && (
              <span className="flex items-center gap-1 text-sev-error text-[10px]"><X className="h-3 w-3" /> {adoError || 'Invalid'}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
