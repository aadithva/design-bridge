import type { AnalysisResult, PRMatchResult, ContentMatchResult, FigmaContentInfo } from '../types';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function assertJsonResponse(resp: Response): void {
  const contentType = resp.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    throw new Error(
      `Expected JSON but got ${contentType || 'unknown content type'} (HTTP ${resp.status}). ` +
      'Is the API server running on port 3001?',
    );
  }
}

async function post<T>(url: string, body: object): Promise<T> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  assertJsonResponse(resp);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

async function get<T>(url: string): Promise<T> {
  const resp = await fetch(url);
  assertJsonResponse(resp);
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

export async function analyze(params: {
  figmaUrl: string;
  figmaPat: string;
  prId?: number;
  adoOrgUrl?: string;
  adoProject?: string;
  adoRepoId?: string;
  adoPat?: string;
}): Promise<AnalysisResult> {
  return post('/api/analyze', params);
}

export async function getAnalysis(id: string): Promise<AnalysisResult> {
  return get(`/api/analyses/${encodeURIComponent(id)}`);
}

export async function listAnalyses(): Promise<AnalysisResult[]> {
  return get('/api/analyses');
}

export async function validateFigmaPat(figmaPat: string): Promise<{ valid: boolean; user?: { handle: string; email: string }; error?: string }> {
  return post('/api/validate/figma-pat', { figmaPat });
}

export async function validateAdoPat(adoOrgUrl: string, adoPat: string): Promise<{ valid: boolean; error?: string }> {
  return post('/api/validate/ado-pat', { adoOrgUrl, adoPat });
}

export async function discoverFigmaFiles(teamId: string, figmaPat: string): Promise<{ files: any[] }> {
  return post('/api/discover/figma-files', { teamId, figmaPat });
}

export async function warmCraftPRs(params: { adoOrgUrl: string; adoPat: string; projects: string[] }): Promise<{ ok: boolean; count: number; cached: boolean }> {
  return post('/api/discover/warm-craft-prs', params);
}

export async function matchFileToPRs(params: {
  adoOrgUrl: string;
  adoPat: string;
  figmaFileName: string;
  figmaFileKey?: string;
  projects: string[];
}): Promise<{ matches: PRMatchResult[] }> {
  return post('/api/discover/match-file-to-prs', params);
}

export async function matchFilesBulk(params: {
  adoOrgUrl: string;
  adoPat: string;
  projects: string[];
  files: Array<{ name: string; fileKey?: string }>;
}): Promise<{ results: Record<string, PRMatchResult[]> }> {
  return post('/api/discover/match-files-bulk', params);
}

export async function deepMatchFileToPRs(params: {
  figmaFileKey: string;
  figmaPat: string;
  adoOrgUrl: string;
  adoPat: string;
  candidatePRs: Array<{ prId: number; repoId: string; project: string }>;
}): Promise<{ results: ContentMatchResult[]; figmaContent: FigmaContentInfo }> {
  return post('/api/discover/deep-match', params);
}

export async function lookupPR(params: {
  adoOrgUrl: string;
  adoPat: string;
  project: string;
  repositoryId?: string;
  pullRequestId: number;
}): Promise<{ pullRequestId: number; title: string; repositoryId: string; project: string; repositoryName: string }> {
  return post('/api/discover/lookup-pr', params);
}

export async function getConfigTeams(): Promise<{ teamIds: string[]; teamNames?: Record<string, string> }> {
  return get('/api/config/teams');
}
