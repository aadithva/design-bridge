import { SettingsPanel } from '../components/SettingsPanel';

export function SettingsPage() {
  return (
    <div>
      <h2 className="text-xs font-semibold tracking-widest uppercase text-ink-secondary mb-5">Settings</h2>
      <SettingsPanel />
    </div>
  );
}
