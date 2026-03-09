/**
 * Environment-driven configuration with fallback defaults for local dev.
 */

export const ADO_ORG_URL = process.env.ADO_ORG_URL || 'https://dev.azure.com/office';
export const ADO_PROJECT = process.env.ADO_PROJECT || 'Office';
export const ADO_REPO_NAME = process.env.ADO_REPO_NAME || '1JS';

export const FIGMA_TEAM_IDS: string[] = (process.env.FIGMA_TEAM_IDS || '1334313619210753334')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export const FIGMA_TEAM_NAMES: Record<string, string> = process.env.FIGMA_TEAM_NAMES
  ? JSON.parse(process.env.FIGMA_TEAM_NAMES)
  : { '1334313619210753334': 'BizChat' };

export const PORT = parseInt(process.env.PORT || '3001');

export const STORAGE_BACKEND = (process.env.STORAGE_BACKEND || 'file') as 'memory' | 'file' | 'azure-table';
export const STORAGE_DIR = process.env.STORAGE_DIR || './data';
export const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING || '';

export const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
export const WEBHOOK_ADO_PAT = process.env.WEBHOOK_ADO_PAT || '';
export const WEBHOOK_FIGMA_PAT = process.env.WEBHOOK_FIGMA_PAT || '';
