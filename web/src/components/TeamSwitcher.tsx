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
        // Only set default team if no team is already selected (preserves context across navigation)
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
    // Store custom name if provided
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
        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
        <span className="text-sm text-slate-400">Loading teams...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-500">Team:</span>
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
            className="rounded-lg bg-white px-3 py-1.5 text-sm shadow-soft-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-200 w-44"
          />
          <input
            type="text"
            value={customTeamName}
            onChange={e => setCustomTeamName(e.target.value)}
            placeholder="Name (optional)"
            className="rounded-lg bg-white px-3 py-1.5 text-sm shadow-soft-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-200 w-36"
          />
          <button
            type="submit"
            disabled={!customTeamId.trim()}
            className="px-2.5 py-1.5 text-xs rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Load
          </button>
          <button
            type="button"
            onClick={() => { setShowAddInput(false); setCustomTeamId(''); setCustomTeamName(''); }}
            className="px-2 py-1.5 text-xs rounded-lg text-slate-500 hover:bg-slate-100"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          onClick={() => setShowAddInput(true)}
          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg text-slate-500 hover:bg-slate-100"
          title="Add a team ID"
        >
          <Plus className="h-3.5 w-3.5" />
          Add team
        </button>
      )}
      {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
    </div>
  );
}
