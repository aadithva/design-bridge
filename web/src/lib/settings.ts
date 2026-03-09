import type { AppSettings } from '../types';

export const STORAGE_KEY = 'designBridge_settings';
export const DEFAULT_ADO_ORG_URL = 'https://dev.azure.com/office';

const DEFAULTS: AppSettings = {
  figmaPat: '',
  figmaTeamIds: '',
  adoPat: '',
  adoOrgUrl: DEFAULT_ADO_ORG_URL,
  adoDefaultProject: '',
};

/** Resolve the ADO org URL — prefer user setting, fall back to default */
export function getAdoOrgUrl(settings: AppSettings): string {
  return settings.adoOrgUrl?.trim() || DEFAULT_ADO_ORG_URL;
}

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
    // Migrate from old key
    const legacy = localStorage.getItem('designReviewBot_settings');
    if (legacy) {
      const settings = { ...DEFAULTS, ...JSON.parse(legacy) };
      saveSettings(settings);
      return settings;
    }
  } catch { /* ignore */ }
  return DEFAULTS;
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
