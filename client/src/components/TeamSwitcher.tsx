import { useState, useEffect } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Select } from './Select';
import { useSettings } from '../lib/SettingsContext';
import { useDiscover } from '../lib/DiscoverContext';
import { getConfigTeams, discoverFigmaFiles } from '../lib/api';
import type { FigmaSearchResult } from '../types';

interface Props {
  onFilesLoaded: (files: FigmaSearchResult[], teamId: string) => void;
  onError: (error: string) => void;
}

export function TeamSwitcher({ onFilesLoaded, onError }: Props) {
  const { settings } = useSettings();
  const { selectedTeam, setSelectedTeam, teamFilesCache, setTeamFilesCache } = useDiscover();
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [teamNames, setTeamNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [showAddInput, setShowAddInput] = useState(false);
  const [customTeamId, setCustomTeamId] = useState('');
  const [customTeamName, setCustomTeamName] = useState('');

  const getTeamLabel = (id: string) => teamNames[id] || id;

  useEffect(() => {
    getConfigTeams()
      .then(data => {
        setTeamIds(data.teamIds);
        if (data.teamNames) setTeamNames(data.teamNames);
        if (!selectedTeam && data.teamIds.length > 0) setSelectedTeam(data.teamIds[0]);
      })
      .catch(err => onError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedTeam || !settings.figmaPat) return;
    const cached = teamFilesCache.get(selectedTeam);
    if (cached) { onFilesLoaded(cached, selectedTeam); return; }
    setLoading(true);
    discoverFigmaFiles(selectedTeam, settings.figmaPat)
      .then(data => {
        const files = data.files as FigmaSearchResult[];
        setTeamFilesCache(prev => new Map(prev).set(selectedTeam, files));
        onFilesLoaded(files, selectedTeam);
      })
      .catch(err => onError(err.message))
      .finally(() => setLoading(false));
  }, [selectedTeam, settings.figmaPat]);

  const handleAddTeam = () => {
    const id = customTeamId.trim();
    if (!id) return;
    const name = customTeamName.trim();
    if (name) {
      setTeamNames(prev => ({ ...prev, [id]: name }));
    }
    if (teamIds.includes(id)) {
      setSelectedTeam(id);
    } else {
      setTeamIds(prev => [...prev, id]);
      setSelectedTeam(id);
    }
    setCustomTeamId('');
    setCustomTeamName('');
    setShowAddInput(false);
  };

  if (loading && teamIds.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" />
        <span className="text-[10px] tracking-wider uppercase text-ink-muted">Loading teams...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] tracking-widest uppercase text-ink-muted">Team:</span>
      {teamIds.length > 0 && (
        <Select
          value={selectedTeam}
          onChange={setSelectedTeam}
          options={teamIds.map(id => ({ value: id, label: getTeamLabel(id) }))}
          className="min-w-[200px]"
        />
      )}
      {showAddInput ? (
        <form
          onSubmit={e => { e.preventDefault(); handleAddTeam(); }}
          className="flex items-center gap-1.5"
        >
          <input
            type="text"
            value={customTeamId}
            onChange={e => setCustomTeamId(e.target.value)}
            placeholder="Team ID..."
            autoFocus
            className="rounded bg-panel-base border border-border px-2.5 py-1 text-xs text-ink outline-none focus:border-accent/40 w-40 placeholder:text-ink-faint"
          />
          <input
            type="text"
            value={customTeamName}
            onChange={e => setCustomTeamName(e.target.value)}
            placeholder="Name"
            className="rounded bg-panel-base border border-border px-2.5 py-1 text-xs text-ink outline-none focus:border-accent/40 w-28 placeholder:text-ink-faint"
          />
          <button
            type="submit"
            disabled={!customTeamId.trim()}
            className="px-2.5 py-1 text-[10px] tracking-wider uppercase rounded bg-accent/20 text-accent-bright hover:bg-accent/30 disabled:opacity-50"
          >
            Load
          </button>
          <button
            type="button"
            onClick={() => { setShowAddInput(false); setCustomTeamId(''); setCustomTeamName(''); }}
            className="px-2 py-1 text-[10px] tracking-wider uppercase rounded text-ink-muted hover:bg-panel-hover"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowAddInput(true)}
          className="inline-flex items-center gap-1 px-2 py-1 text-[10px] tracking-wider uppercase rounded text-ink-muted hover:bg-panel-hover"
          title="Add a team ID"
        >
          <Plus className="h-3 w-3" />
          Add
        </button>
      )}
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-muted" />}
    </div>
  );
}
