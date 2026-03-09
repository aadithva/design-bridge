import { useState, useMemo } from 'react';
import { Filter, Search } from 'lucide-react';
import { Select } from '../components/Select';
import { TeamSwitcher } from '../components/TeamSwitcher';
import { DiscoverTable } from '../components/DiscoverTable';
import { useDiscover } from '../lib/DiscoverContext';
import type { FigmaSearchResult } from '../types';

export function DiscoverPage() {
  const { files, setFiles } = useDiscover();
  const [loading, setLoading] = useState(files.length === 0);
  const [error, setError] = useState('');
  const [projectFilter, setProjectFilter] = useState('all');
  const [minConfidence, setMinConfidence] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');

  const handleFilesLoaded = (loadedFiles: FigmaSearchResult[]) => {
    setFiles(loadedFiles);
    setLoading(false);
    setError('');
  };

  const handleError = (message: string) => {
    setError(message);
    setLoading(false);
  };

  const projects = useMemo(() => {
    const names = new Set(files.map(f => f.projectName).filter(Boolean));
    return [...names].sort();
  }, [files]);

  const filteredFiles = useMemo(() => {
    let result = files;
    if (projectFilter !== 'all') {
      result = result.filter(f => f.projectName === projectFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(f =>
        f.name.toLowerCase().includes(q) ||
        f.projectName?.toLowerCase().includes(q),
      );
    }
    return result;
  }, [files, projectFilter, searchQuery]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-slate-900">Discover</h2>
        <TeamSwitcher onFilesLoaded={handleFilesLoaded} onError={handleError} />
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {files.length > 0 && (
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search files..."
              className="rounded-lg bg-white pl-8 pr-3 py-1.5 text-sm shadow-soft-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-200 w-56"
            />
          </div>
          <div className="h-5 w-px bg-slate-200" />
          <Filter className="h-4 w-4 text-slate-400" />
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Project:</span>
            <Select
              value={projectFilter}
              onChange={setProjectFilter}
              options={[
                { value: 'all', label: `All (${files.length})` },
                ...projects.map(p => ({
                  value: p,
                  label: `${p} (${files.filter(f => f.projectName === p).length})`,
                })),
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Min confidence:</span>
            <Select
              value={String(minConfidence)}
              onChange={v => setMinConfidence(Number(v))}
              options={[
                { value: '0', label: 'Any' },
                { value: '30', label: '30%+' },
                { value: '50', label: '50%+' },
                { value: '70', label: '70%+' },
                { value: '90', label: '90%+' },
              ]}
            />
          </div>
          {(searchQuery || projectFilter !== 'all') && (
            <span className="text-slate-400">
              {filteredFiles.length} of {files.length} files
            </span>
          )}
        </div>
      )}

      <DiscoverTable files={filteredFiles} loading={loading} minConfidence={minConfidence} />
    </div>
  );
}
