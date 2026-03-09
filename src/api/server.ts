/**
 * Express API server for the Design Review Bot web frontend.
 * Provides endpoints to run comparisons and retrieve results.
 */
import express from 'express';
import cors from 'cors';
import path from 'path';
import { FigmaClient } from '../services/figma/figma-client.js';
import { PrFetcher } from '../services/ado/pr-fetcher.js';
import { parseAndFilterDiff } from '../services/code-analysis/diff-parser.js';
import {
  extractComponentSpec,
  findMatchingComponents,
  parseCodeStyles,
  compareComponent,
  deriveSearchTerms,
  ReviewResult,
  ComponentComparison,
} from '../services/comparison/component-matcher.js';
import { detectRelevantPages } from '../services/figma/por-page-detector.js';
import { enumeratePageScenarios } from '../services/figma/scenario-enumerator.js';
import { checkCompleteness } from '../services/comparison/completeness-checker.js';
import { DiscoveryService } from '../services/ado/discovery-service.js';
import { matchPRToFigmaFiles, matchFigmaFileToPRs, searchRepoFolders, normalize, FigmaFileEntry } from '../services/matching/craft-figma-matcher.js';
import { CommitSearchService } from '../services/ado/commit-search.js';
import { deepMatchFigmaFileToPRs, ContentMatchResult } from '../services/matching/content-matcher.js';
import { extractTextContent } from '../services/figma/text-extractor.js';
import { runAnalysis } from './analysis-engine.js';
import type { AnalysisResult } from './types.js';
import {
  FIGMA_TEAM_IDS, FIGMA_TEAM_NAMES, ADO_REPO_NAME, ADO_ORG_URL, ADO_PROJECT,
  PORT, STORAGE_BACKEND, AZURE_STORAGE_CONNECTION_STRING,
  WEBHOOK_ADO_PAT, WEBHOOK_FIGMA_PAT,
} from './config.js';
import { spawnAgencyReview, saveReport } from '../services/agency/agency-runner.js';
import type { StorageProvider } from './storage/types.js';
import { MemoryProvider } from './storage/memory-provider.js';
import { createWebhookRouter } from './routes/webhook.js';
import { createMcpRouter } from './routes/mcp.js';
import type { McpConfig } from '../mcp-server.js';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static frontend files
const webDist = path.join(__dirname, '../../web/dist');
app.use(express.static(webDist));

// --- Storage setup ---
async function createStorageProviders(): Promise<{
  analysisStore: StorageProvider<AnalysisResult>;
  reviewStore: StorageProvider<ReviewResult>;
}> {
  if (STORAGE_BACKEND === 'azure-table' && AZURE_STORAGE_CONNECTION_STRING) {
    const { AzureTableProvider } = await import('./storage/azure-table-provider.js');
    return {
      analysisStore: new AzureTableProvider<AnalysisResult>(AZURE_STORAGE_CONNECTION_STRING, 'analyses'),
      reviewStore: new AzureTableProvider<ReviewResult>(AZURE_STORAGE_CONNECTION_STRING, 'reviews'),
    };
  }
  return {
    analysisStore: new MemoryProvider<AnalysisResult>(),
    reviewStore: new MemoryProvider<ReviewResult>(50),
  };
}

// In-memory caches (short TTL, rebuilt on access — NOT persisted)
const figmaFileCache = new Map<string, { files: FigmaFileEntry[]; timestamp: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const craftPRCache = new Map<string, { prs: any[]; timestamp: number }>();

const figmaContentCache = new Map<string, {
  componentNames: string[];
  texts: string[];
  pageName: string;
  timestamp: number;
}>();
const CONTENT_CACHE_TTL = 30 * 60 * 1000;

const commitSearchCache = new Map<string, { matchedPRIds: Set<number>; timestamp: number }>();

const repoIdCache = new Map<string, string>();
async function resolveRepoId(adoOrgUrl: string, adoPat: string, project: string, repoName: string): Promise<string | undefined> {
  const cacheKey = `${project}:${repoName}`;
  if (repoIdCache.has(cacheKey)) return repoIdCache.get(cacheKey);
  const service = new DiscoveryService(adoOrgUrl, adoPat);
  const repos = await service.getRepositories(project);
  const match = repos.find(r => r.name.toLowerCase() === repoName.toLowerCase());
  if (match) {
    repoIdCache.set(cacheKey, match.id);
    return match.id;
  }
  return undefined;
}

function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string } {
  const fileKeyMatch = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (!fileKeyMatch) throw new Error('Invalid Figma URL');
  const fileKey = fileKeyMatch[1];
  let nodeId: string | undefined;
  const nodeIdMatch = url.match(/[?&]node-id=([^&#\s]+)/);
  if (nodeIdMatch) nodeId = decodeURIComponent(nodeIdMatch[1]).replace('-', ':');
  return { fileKey, nodeId };
}

// --- Boot ---
async function boot() {
  const { analysisStore, reviewStore } = await createStorageProviders();

  // POST /api/review — run a design comparison (delegates to runAnalysis)
  app.post('/api/review', async (req, res) => {
    try {
      const { figmaUrl, prId, adoOrgUrl, adoProject, adoRepoId, adoPat, figmaPat } = req.body;
      if (!figmaUrl || !figmaPat) {
        return res.status(400).json({ error: 'figmaUrl and figmaPat are required' });
      }
      const analysisResult = await runAnalysis({
        figmaUrl, figmaPat,
        prId: prId ? parseInt(prId) : undefined,
        adoOrgUrl, adoProject, adoRepoId, adoPat,
      });
      if (analysisResult.status === 'failed') {
        return res.status(500).json({ error: analysisResult.error });
      }
      const result: ReviewResult = {
        prTitle: analysisResult.prTitle,
        prId: analysisResult.prId,
        figmaUrl: analysisResult.figmaUrl,
        figmaPageName: analysisResult.figmaPageName,
        components: analysisResult.components,
        codeFile: analysisResult.codeFiles.join(', ') || 'No code files',
        summary: analysisResult.summary,
      };
      await reviewStore.set(`review-${Date.now()}`, result);
      res.json(result);
    } catch (err: any) {
      console.error('Review error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // POST /api/review-full — run a design comparison using full file content (delegates to runAnalysis)
  app.post('/api/review-full', async (req, res) => {
    try {
      const { figmaUrl, prId, adoOrgUrl, adoProject, adoRepoId, adoPat, figmaPat } = req.body;
      if (!figmaUrl || !figmaPat) {
        return res.status(400).json({ error: 'figmaUrl and figmaPat are required' });
      }
      const analysisResult = await runAnalysis({
        figmaUrl, figmaPat,
        prId: prId ? parseInt(prId) : undefined,
        adoOrgUrl, adoProject, adoRepoId, adoPat,
      });
      if (analysisResult.status === 'failed') {
        return res.status(500).json({ error: analysisResult.error });
      }
      const result: ReviewResult = {
        prTitle: analysisResult.prTitle,
        prId: analysisResult.prId,
        figmaUrl: analysisResult.figmaUrl,
        figmaPageName: analysisResult.figmaPageName,
        components: analysisResult.components,
        codeFile: analysisResult.codeFiles.join(', ') || 'No code files',
        summary: analysisResult.summary,
      };
      await reviewStore.set(`review-${Date.now()}`, result);
      res.json(result);
    } catch (err: any) {
      console.error('Review-full error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    }
  });

  // POST /api/search-figma — search Figma files by name
  app.post('/api/search-figma', async (req, res) => {
    try {
      const { teamId, query, figmaPat, maxResults } = req.body;
      if (!teamId || !query || !figmaPat) {
        return res.status(400).json({ error: 'teamId, query, and figmaPat are required' });
      }
      const client = new FigmaClient(figmaPat);
      const results = await client.searchFiles(teamId, query, maxResults || 10);
      res.json({ results });
    } catch (err: any) {
      console.error('Search error:', err);
      res.status(500).json({ error: err.message || 'Search failed' });
    }
  });

  // POST /api/enumerate-scenarios — enumerate Figma page scenarios
  app.post('/api/enumerate-scenarios', async (req, res) => {
    try {
      const { figmaUrl, figmaPat } = req.body;
      if (!figmaUrl || !figmaPat) {
        return res.status(400).json({ error: 'figmaUrl and figmaPat are required' });
      }
      const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
      const client = new FigmaClient(figmaPat);

      let pageNode: any;
      let pageInfo: { pageId: string; pageName: string; pageType: string };

      if (nodeId) {
        const nodesData = await client.getFileNodes(fileKey, [nodeId]);
        const nodeData = nodesData.nodes?.[nodeId];
        if (!nodeData?.document) {
          return res.status(404).json({ error: `Node ${nodeId} not found` });
        }
        pageNode = nodeData.document;
        pageInfo = { pageId: nodeId, pageName: pageNode.name, pageType: 'specified' };
      } else {
        const figmaFile = await client.getFile(fileKey, 4);
        const relevant = detectRelevantPages(figmaFile.document);
        const targetPage = relevant.redlinesPage ?? relevant.porPage;
        if (!targetPage) {
          return res.status(404).json({ error: 'No pages found in Figma file' });
        }
        pageNode = figmaFile.document.children?.find((c: any) => c.id === targetPage.pageId);
        if (!pageNode) {
          return res.status(404).json({ error: 'Could not find target page node' });
        }
        const pageType = relevant.redlinesPage && targetPage === relevant.redlinesPage ? 'redlines' : 'por';
        pageInfo = { pageId: targetPage.pageId, pageName: targetPage.pageName, pageType };
      }

      const manifest = enumeratePageScenarios(pageNode);
      res.json({ page: pageInfo, manifest });
    } catch (err: any) {
      console.error('Enumerate error:', err);
      res.status(500).json({ error: err.message || 'Enumeration failed' });
    }
  });

  // POST /api/completeness-check — run completeness check
  app.post('/api/completeness-check', async (req, res) => {
    try {
      const { figmaUrl, figmaPat, codeComponents, codeFiles } = req.body;
      if (!figmaUrl || !figmaPat) {
        return res.status(400).json({ error: 'figmaUrl and figmaPat are required' });
      }
      const { fileKey, nodeId } = parseFigmaUrl(figmaUrl);
      const client = new FigmaClient(figmaPat);

      let pageNode: any;
      if (nodeId) {
        const nodesData = await client.getFileNodes(fileKey, [nodeId]);
        const nodeData = nodesData.nodes?.[nodeId];
        if (!nodeData?.document) {
          return res.status(404).json({ error: `Node ${nodeId} not found` });
        }
        pageNode = nodeData.document;
      } else {
        const figmaFile = await client.getFile(fileKey, 4);
        const relevant = detectRelevantPages(figmaFile.document);
        const targetPage = relevant.redlinesPage ?? relevant.porPage;
        if (!targetPage) {
          return res.status(404).json({ error: 'No pages found' });
        }
        pageNode = figmaFile.document.children?.find((c: any) => c.id === targetPage.pageId);
        if (!pageNode) {
          return res.status(404).json({ error: 'Could not find target page node' });
        }
      }

      const manifest = enumeratePageScenarios(pageNode);
      const report = checkCompleteness(manifest, codeComponents || [], codeFiles || []);
      res.json({ report, manifest: { totalCount: manifest.totalCount, componentNames: manifest.componentNames } });
    } catch (err: any) {
      console.error('Completeness check error:', err);
      res.status(500).json({ error: err.message || 'Completeness check failed' });
    }
  });

  // POST /api/validate/figma-pat — validate Figma PAT
  app.post('/api/validate/figma-pat', async (req, res) => {
    try {
      const { figmaPat } = req.body;
      if (!figmaPat) return res.status(400).json({ valid: false, error: 'figmaPat is required' });
      const client = new FigmaClient(figmaPat);
      const user = await client.getMe();
      res.json({ valid: true, user });
    } catch (err: any) {
      res.json({ valid: false, error: err.message || 'Invalid PAT' });
    }
  });

  // POST /api/validate/ado-pat — validate ADO PAT
  app.post('/api/validate/ado-pat', async (req, res) => {
    try {
      const { adoOrgUrl, adoPat } = req.body;
      if (!adoOrgUrl || !adoPat) return res.status(400).json({ valid: false, error: 'adoOrgUrl and adoPat are required' });
      const service = new DiscoveryService(adoOrgUrl, adoPat);
      await service.getProjects();
      res.json({ valid: true });
    } catch (err: any) {
      res.json({ valid: false, error: err.message || 'Invalid PAT or org URL' });
    }
  });

  // POST /api/discover/projects — list ADO projects
  app.post('/api/discover/projects', async (req, res) => {
    try {
      const { adoOrgUrl, adoPat } = req.body;
      if (!adoOrgUrl || !adoPat) return res.status(400).json({ error: 'adoOrgUrl and adoPat are required' });
      const service = new DiscoveryService(adoOrgUrl, adoPat);
      const projects = await service.getProjects();
      res.json({ projects });
    } catch (err: any) {
      console.error('Discover projects error:', err);
      res.status(500).json({ error: err.message || 'Failed to discover projects' });
    }
  });

  // POST /api/discover/repos — list repos in a project
  app.post('/api/discover/repos', async (req, res) => {
    try {
      const { adoOrgUrl, adoPat, project } = req.body;
      if (!adoOrgUrl || !adoPat || !project) return res.status(400).json({ error: 'adoOrgUrl, adoPat, and project are required' });
      const service = new DiscoveryService(adoOrgUrl, adoPat);
      const repos = await service.getRepositories(project);
      res.json({ repos });
    } catch (err: any) {
      console.error('Discover repos error:', err);
      res.status(500).json({ error: err.message || 'Failed to discover repos' });
    }
  });

  // POST /api/discover/craft-prs — find craft (frontend) PRs
  app.post('/api/discover/craft-prs', async (req, res) => {
    try {
      const { adoOrgUrl, adoPat, project, repoId, maxAgeDays, top } = req.body;
      if (!adoOrgUrl || !adoPat || !project) return res.status(400).json({ error: 'adoOrgUrl, adoPat, and project are required' });
      const service = new DiscoveryService(adoOrgUrl, adoPat);
      const craftPRs = await service.getCraftPRs(project, repoId, { maxAgeDays, top });
      res.json({ craftPRs });
    } catch (err: any) {
      console.error('Discover craft PRs error:', err);
      res.status(500).json({ error: err.message || 'Failed to discover craft PRs' });
    }
  });

  // POST /api/discover/figma-project-files — list files in a Figma project
  app.post('/api/discover/figma-project-files', async (req, res) => {
    try {
      const { figmaPat, projectId } = req.body;
      if (!figmaPat || !projectId) return res.status(400).json({ error: 'figmaPat and projectId are required' });
      const client = new FigmaClient(figmaPat);
      const { files } = await client.getProjectFiles(Number(projectId));
      const mapped = files.map((f: any) => ({
        fileKey: f.key,
        name: f.name,
        projectName: '',
        projectId: Number(projectId),
        figmaUrl: `https://www.figma.com/design/${f.key}`,
        thumbnailUrl: f.thumbnail_url,
        lastModified: f.last_modified,
        relevanceScore: 0,
      }));
      res.json({ files: mapped });
    } catch (err: any) {
      console.error('Discover Figma project files error:', err);
      res.status(500).json({ error: err.message || 'Failed to load files' });
    }
  });

  app.post('/api/discover/figma-files', async (req, res) => {
    try {
      const { figmaPat, teamId } = req.body;
      if (!figmaPat || !teamId) return res.status(400).json({ error: 'figmaPat and teamId are required' });

      const cached = figmaFileCache.get(teamId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json({ files: cached.files });
      }

      const client = new FigmaClient(figmaPat);
      const files = await client.getAllTeamFiles(teamId);
      figmaFileCache.set(teamId, { files, timestamp: Date.now() });
      res.json({ files });
    } catch (err: any) {
      console.error('Discover Figma files error:', err);
      res.status(500).json({ error: err.message || 'Failed to discover Figma files' });
    }
  });

  // POST /api/discover/match — match craft PRs to Figma files
  app.post('/api/discover/match', async (req, res) => {
    try {
      const { figmaPat, teamId, craftPRs } = req.body;
      if (!figmaPat || !teamId || !craftPRs) return res.status(400).json({ error: 'figmaPat, teamId, and craftPRs are required' });

      let files: FigmaFileEntry[];
      const cached = figmaFileCache.get(teamId);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        files = cached.files;
      } else {
        const client = new FigmaClient(figmaPat);
        const allFiles = await client.getAllTeamFiles(teamId);
        files = allFiles.map(f => ({
          fileKey: f.fileKey,
          name: f.name,
          projectName: f.projectName,
          projectId: f.projectId,
          figmaUrl: f.figmaUrl,
          thumbnailUrl: f.thumbnailUrl,
          lastModified: f.lastModified,
        }));
        figmaFileCache.set(teamId, { files, timestamp: Date.now() });
      }

      const matches = (craftPRs as any[]).map(pr => ({
        pullRequestId: pr.pullRequestId,
        matches: matchPRToFigmaFiles(pr.componentNames || [], files),
      }));

      res.json({ matches });
    } catch (err: any) {
      console.error('Match error:', err);
      res.status(500).json({ error: err.message || 'Matching failed' });
    }
  });

  // POST /api/discover/match-file-to-prs — find ADO PRs matching a Figma file
  app.post('/api/discover/match-file-to-prs', async (req, res) => {
    try {
      const { adoOrgUrl, adoPat, figmaFileName, figmaFileKey, projects } = req.body;
      if (!adoOrgUrl || !adoPat || !figmaFileName || !projects?.length) {
        return res.status(400).json({ error: 'adoOrgUrl, adoPat, figmaFileName, and projects are required' });
      }

      const repoSuffix = ADO_REPO_NAME ? `:${ADO_REPO_NAME}` : '';
      const cacheKey = (projects as string[]).slice().sort().join('|') + repoSuffix;
      const cached = craftPRCache.get(cacheKey);
      let craftPRs: any[];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        craftPRs = cached.prs;
      } else {
        const service = new DiscoveryService(adoOrgUrl, adoPat);
        if (ADO_REPO_NAME && projects.length > 0) {
          const repoId = await resolveRepoId(adoOrgUrl, adoPat, projects[0], ADO_REPO_NAME);
          craftPRs = repoId
            ? await service.getCraftPRs(projects[0], repoId)
            : await service.discoverAllCraftPRs(projects);
        } else {
          craftPRs = await service.discoverAllCraftPRs(projects);
        }
        craftPRCache.set(cacheKey, { prs: craftPRs, timestamp: Date.now() });
      }

      // Enrich with commit search signal (non-fatal)
      let commitMatchedPRIds: Set<number> | undefined;
      try {
        const normName = normalize(figmaFileName);
        const commitCached = commitSearchCache.get(normName);
        if (commitCached && Date.now() - commitCached.timestamp < CACHE_TTL) {
          commitMatchedPRIds = commitCached.matchedPRIds;
        } else {
          const commitService = new CommitSearchService(adoOrgUrl, adoPat);
          const commits = await commitService.searchCommits(figmaFileName, projects[0], {
            repoName: ADO_REPO_NAME || undefined,
          });
          if (commits.length > 0) {
            const repoId = ADO_REPO_NAME
              ? await resolveRepoId(adoOrgUrl, adoPat, projects[0], ADO_REPO_NAME)
              : undefined;
            if (repoId) {
              commitMatchedPRIds = await commitService.findPRIdsForCommits(
                commits.map(c => c.commitId),
                repoId,
                projects[0],
              );
            }
          }
          commitSearchCache.set(normName, {
            matchedPRIds: commitMatchedPRIds ?? new Set(),
            timestamp: Date.now(),
          });
          if (commitMatchedPRIds && commitMatchedPRIds.size > 0) {
            console.log(`[commit-search] "${figmaFileName}" → ${commits.length} commits → ${commitMatchedPRIds.size} PRs`);
          }
        }
      } catch (err) {
        console.warn('[commit-search] failed, proceeding without commit signal:', err);
      }

      const matches = matchFigmaFileToPRs(figmaFileName, craftPRs, { figmaFileKey, commitMatchedPRIds });
      res.json({ matches });
    } catch (err: any) {
      console.error('Match file to PRs error:', err);
      res.status(500).json({ error: err.message || 'Failed to find matching PRs' });
    }
  });

  // POST /api/discover/match-files-bulk — match many Figma files to PRs in one request
  app.post('/api/discover/match-files-bulk', async (req, res) => {
    try {
      const { adoOrgUrl, adoPat, projects, files } = req.body;
      if (!adoOrgUrl || !adoPat || !projects?.length || !Array.isArray(files)) {
        return res.status(400).json({ error: 'adoOrgUrl, adoPat, projects, and files[] are required' });
      }

      // 1. Resolve craft PRs (from cache or fresh)
      const repoSuffix = ADO_REPO_NAME ? `:${ADO_REPO_NAME}` : '';
      const cacheKey = (projects as string[]).slice().sort().join('|') + repoSuffix;
      const cached = craftPRCache.get(cacheKey);
      let craftPRs: any[];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        craftPRs = cached.prs;
      } else {
        const service = new DiscoveryService(adoOrgUrl, adoPat);
        if (ADO_REPO_NAME && projects.length > 0) {
          const repoId = await resolveRepoId(adoOrgUrl, adoPat, projects[0], ADO_REPO_NAME);
          craftPRs = repoId
            ? await service.getCraftPRs(projects[0], repoId)
            : await service.discoverAllCraftPRs(projects);
        } else {
          craftPRs = await service.discoverAllCraftPRs(projects);
        }
        craftPRCache.set(cacheKey, { prs: craftPRs, timestamp: Date.now() });
      }

      // 2. Batch commit search — deduplicate by normalized name
      const commitService = new CommitSearchService(adoOrgUrl, adoPat);
      const commitMap = new Map<string, Set<number>>();
      const uniqueNames = new Map<string, string>(); // normName → original
      for (const f of files as Array<{ name: string; fileKey?: string }>) {
        const norm = normalize(f.name);
        if (norm && norm.length >= 3 && !uniqueNames.has(norm)) {
          uniqueNames.set(norm, f.name);
        }
      }

      // Run commit searches in parallel with concurrency limit
      const CONCURRENCY = 5;
      const nameEntries = [...uniqueNames.entries()];
      for (let i = 0; i < nameEntries.length; i += CONCURRENCY) {
        const batch = nameEntries.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async ([normName, originalName]) => {
          try {
            const commitCached = commitSearchCache.get(normName);
            if (commitCached && Date.now() - commitCached.timestamp < CACHE_TTL) {
              commitMap.set(normName, commitCached.matchedPRIds);
              return;
            }
            const commits = await commitService.searchCommits(originalName, projects[0], {
              repoName: ADO_REPO_NAME || undefined,
            });
            let matchedPRIds = new Set<number>();
            if (commits.length > 0) {
              const repoId = ADO_REPO_NAME
                ? await resolveRepoId(adoOrgUrl, adoPat, projects[0], ADO_REPO_NAME)
                : undefined;
              if (repoId) {
                matchedPRIds = await commitService.findPRIdsForCommits(
                  commits.map((c: any) => c.commitId),
                  repoId,
                  projects[0],
                );
              }
            }
            commitSearchCache.set(normName, { matchedPRIds, timestamp: Date.now() });
            commitMap.set(normName, matchedPRIds);
          } catch {
            commitMap.set(normName, new Set());
          }
        }));
      }

      // 3. Match each file (pure CPU, no I/O)
      const results: Record<string, any[]> = {};
      for (const f of files as Array<{ name: string; fileKey?: string }>) {
        const normName = normalize(f.name);
        const commitMatchedPRIds = commitMap.get(normName);
        const matches = matchFigmaFileToPRs(f.name, craftPRs, {
          figmaFileKey: f.fileKey,
          commitMatchedPRIds,
        });
        results[f.fileKey || f.name] = matches;
      }

      res.json({ results });
    } catch (err: any) {
      console.error('Bulk match error:', err);
      res.status(500).json({ error: err.message || 'Bulk matching failed' });
    }
  });

  // POST /api/discover/warm-craft-prs — pre-warm the craft PR cache
  app.post('/api/discover/warm-craft-prs', async (req, res) => {
    try {
      const { adoOrgUrl, adoPat, projects } = req.body;
      if (!adoOrgUrl || !adoPat || !projects?.length) {
        return res.status(400).json({ error: 'adoOrgUrl, adoPat, and projects are required' });
      }

      const repoSuffix = ADO_REPO_NAME ? `:${ADO_REPO_NAME}` : '';
      const cacheKey = (projects as string[]).slice().sort().join('|') + repoSuffix;
      const cached = craftPRCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return res.json({ ok: true, count: cached.prs.length, cached: true });
      }

      const service = new DiscoveryService(adoOrgUrl, adoPat);
      let craftPRs: any[];

      if (ADO_REPO_NAME && projects.length > 0) {
        const repoId = await resolveRepoId(adoOrgUrl, adoPat, projects[0], ADO_REPO_NAME);
        if (repoId) {
          craftPRs = await service.getCraftPRs(projects[0], repoId);
        } else {
          console.warn(`Repo "${ADO_REPO_NAME}" not found in project "${projects[0]}", falling back to all repos`);
          craftPRs = await service.discoverAllCraftPRs(projects);
        }
      } else {
        craftPRs = await service.discoverAllCraftPRs(projects);
      }

      craftPRCache.set(cacheKey, { prs: craftPRs, timestamp: Date.now() });
      res.json({ ok: true, count: craftPRs.length, cached: false });
    } catch (err: any) {
      console.error('Warm craft PRs error:', err);
      res.status(500).json({ error: err.message || 'Failed to warm craft PR cache' });
    }
  });

  // POST /api/discover/search-repo — search repo folders matching a Figma file name
  app.post('/api/discover/search-repo', async (req, res) => {
    try {
      const { figmaFileName, adoOrgUrl, adoPat, projects } = req.body;
      if (!figmaFileName || !adoOrgUrl || !adoPat || !projects?.length) {
        return res.status(400).json({ error: 'figmaFileName, adoOrgUrl, adoPat, and projects are required' });
      }

      const repoSuffix = ADO_REPO_NAME ? `:${ADO_REPO_NAME}` : '';
      const cacheKey = (projects as string[]).slice().sort().join('|') + repoSuffix;
      const cached = craftPRCache.get(cacheKey);
      let craftPRs: any[];
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        craftPRs = cached.prs;
      } else {
        const service = new DiscoveryService(adoOrgUrl, adoPat);
        if (ADO_REPO_NAME && projects.length > 0) {
          const repoId = await resolveRepoId(adoOrgUrl, adoPat, projects[0], ADO_REPO_NAME);
          craftPRs = repoId
            ? await service.getCraftPRs(projects[0], repoId)
            : await service.discoverAllCraftPRs(projects);
        } else {
          craftPRs = await service.discoverAllCraftPRs(projects);
        }
        craftPRCache.set(cacheKey, { prs: craftPRs, timestamp: Date.now() });
      }

      const folders = searchRepoFolders(figmaFileName, craftPRs);
      res.json({ folders });
    } catch (err: any) {
      console.error('Search repo error:', err);
      res.status(500).json({ error: err.message || 'Failed to search repo folders' });
    }
  });

  // POST /api/discover/deep-match — deep content matching between Figma file and candidate PRs
  app.post('/api/discover/deep-match', async (req, res) => {
    try {
      const { figmaFileKey, figmaPat, adoOrgUrl, adoPat, candidatePRs } = req.body;
      if (!figmaFileKey || !figmaPat || !adoOrgUrl || !adoPat || !candidatePRs?.length) {
        return res.status(400).json({ error: 'figmaFileKey, figmaPat, adoOrgUrl, adoPat, and candidatePRs are required' });
      }

      const contentCached = figmaContentCache.get(figmaFileKey);
      let figmaContent: { componentNames: string[]; texts: string[]; pageName: string };

      if (contentCached && Date.now() - contentCached.timestamp < CONTENT_CACHE_TTL) {
        figmaContent = contentCached;
      } else {
        const client = new FigmaClient(figmaPat);
        const figmaFile = await client.getFile(figmaFileKey, 8);
        const relevant = detectRelevantPages(figmaFile.document);
        const targetPage = relevant.porPage ?? relevant.redlinesPage;

        if (!targetPage) {
          return res.status(404).json({ error: 'No relevant pages found in Figma file' });
        }

        const pageNode = figmaFile.document.children?.find((c: any) => c.id === targetPage.pageId);
        if (!pageNode) {
          return res.status(404).json({ error: 'Could not find target page node' });
        }

        const manifest = enumeratePageScenarios(pageNode, 6);
        const texts = extractTextContent(pageNode);

        figmaContent = {
          componentNames: manifest.componentNames,
          texts,
          pageName: targetPage.pageName,
        };

        figmaContentCache.set(figmaFileKey, { ...figmaContent, timestamp: Date.now() });
      }

      const prDataList: Array<{ prId: number; componentNames: string[] }> = [];
      for (const candidate of candidatePRs) {
        let found = false;
        for (const cached of craftPRCache.values()) {
          const pr = cached.prs.find((p: any) => p.pullRequestId === candidate.prId);
          if (pr) {
            prDataList.push({ prId: pr.pullRequestId, componentNames: pr.componentNames || [] });
            found = true;
            break;
          }
        }
        if (!found) {
          prDataList.push({ prId: candidate.prId, componentNames: [] });
        }
      }

      const results = deepMatchFigmaFileToPRs(figmaContent, prDataList);

      res.json({
        results,
        figmaContent: {
          pageName: figmaContent.pageName,
          componentNames: figmaContent.componentNames,
          textSamples: figmaContent.texts.slice(0, 20),
          componentCount: figmaContent.componentNames.length,
        },
      });
    } catch (err: any) {
      console.error('Deep match error:', err);
      res.status(500).json({ error: err.message || 'Deep matching failed' });
    }
  });

  // POST /api/discover/lookup-pr — look up a single PR by ID
  app.post('/api/discover/lookup-pr', async (req, res) => {
    try {
      const { adoOrgUrl, adoPat, project, repositoryId, pullRequestId } = req.body;
      if (!adoOrgUrl || !adoPat || !project || !pullRequestId) {
        return res.status(400).json({ error: 'adoOrgUrl, adoPat, project, and pullRequestId are required' });
      }

      const fetcher = new PrFetcher(adoOrgUrl, adoPat);

      let repoId = repositoryId;
      if (!repoId) {
        if (ADO_REPO_NAME) {
          repoId = await resolveRepoId(adoOrgUrl, adoPat, project, ADO_REPO_NAME);
        }
        if (!repoId) {
          const service = new DiscoveryService(adoOrgUrl, adoPat);
          const repos = await service.getRepositories(project);
          if (repos.length > 0) repoId = repos[0].id;
        }
      }

      if (!repoId) {
        return res.status(400).json({ error: 'Could not resolve a repository. Provide repositoryId.' });
      }

      const prInfo = await fetcher.getPrInfo(repoId, Number(pullRequestId), project);
      res.json({
        pullRequestId: prInfo.pullRequestId,
        title: prInfo.title,
        repositoryId: prInfo.repositoryId,
        project: prInfo.projectName,
        repositoryName: ADO_REPO_NAME || '',
      });
    } catch (err: any) {
      console.error('Lookup PR error:', err);
      res.status(500).json({ error: err.message || 'Failed to look up PR' });
    }
  });

  // POST /api/analyze — run analysis, store result, return it
  app.post('/api/analyze', async (req, res) => {
    try {
      const { figmaUrl, figmaPat, prId, adoOrgUrl, adoProject, adoRepoId, adoPat } = req.body;
      if (!figmaUrl || !figmaPat) {
        return res.status(400).json({ error: 'figmaUrl and figmaPat are required' });
      }
      const result = await runAnalysis({
        figmaUrl, figmaPat,
        prId: prId ? Number(prId) : undefined,
        adoOrgUrl, adoProject, adoRepoId, adoPat,
      });

      const numericPrId = prId ? Number(prId) : undefined;
      if (numericPrId && adoPat && adoOrgUrl && adoProject && adoRepoId) {
        result.aiSummaryStatus = 'pending';
      } else {
        result.aiSummaryStatus = 'unavailable';
      }

      await analysisStore.set(result.id, result);
      res.json(result);

      // Fire-and-forget: spawn Agency CLI for AI narrative (only if we have a PR)
      if (numericPrId && adoPat && adoOrgUrl && adoProject && adoRepoId) {
        const storedResult = await analysisStore.get(result.id);
        if (storedResult) {
          storedResult.aiSummaryStatus = 'generating';
          await analysisStore.set(result.id, storedResult);

          spawnAgencyReview({
            prId: numericPrId,
            figmaUrl,
            adoPat,
            figmaPat,
            adoOrgUrl,
            adoProject,
            adoRepoId,
          }).then(async (markdown) => {
            const updated = await analysisStore.get(result.id);
            if (updated) {
              updated.aiSummary = markdown;
              updated.aiSummaryStatus = 'completed';
              await analysisStore.set(result.id, updated);
            }
            console.log(`[agency] AI summary generated for analysis ${result.id}`);
            try {
              const reportPath = saveReport(markdown, numericPrId);
              console.log(`[agency] Report saved to ${reportPath}`);
            } catch (saveErr) {
              console.warn('[agency] Failed to save report file:', saveErr);
            }
          }).catch(async (err) => {
            const updated = await analysisStore.get(result.id);
            if (updated) {
              updated.aiSummaryStatus = 'failed';
              await analysisStore.set(result.id, updated);
            }
            console.error(`[agency] AI summary generation failed for analysis ${result.id}:`, err);
          });
        }
      }
    } catch (err: any) {
      console.error('Analyze error:', err);
      res.status(500).json({ error: err.message || 'Analysis failed' });
    }
  });

  // GET /api/analyses — list all stored analyses (summaries)
  app.get('/api/analyses', async (_req, res) => {
    const all = await analysisStore.list();
    const summaries = all.map(r => ({
      id: r.id,
      status: r.status,
      createdAt: r.createdAt,
      prTitle: r.prTitle,
      figmaPageName: r.figmaPageName,
      summary: r.summary,
    }));
    res.json(summaries);
  });

  // GET /api/analyses/:id — lookup a stored analysis
  app.get('/api/analyses/:id', async (req, res) => {
    const result = await analysisStore.get(req.params.id);
    if (!result) return res.status(404).json({ error: 'Analysis not found' });
    res.json(result);
  });

  // POST /api/analyses/:id/retry-ai — re-trigger AI summary using server credentials
  app.post('/api/analyses/:id/retry-ai', async (req, res) => {
    try {
      const result = await analysisStore.get(req.params.id);
      if (!result) return res.status(404).json({ error: 'Analysis not found' });
      if (!result.prId) return res.status(400).json({ error: 'No PR associated with this analysis' });
      if (!WEBHOOK_ADO_PAT || !WEBHOOK_FIGMA_PAT) {
        return res.status(400).json({ error: 'Server credentials not configured' });
      }

      const adoOrgUrl = ADO_ORG_URL;
      const adoProject = result.adoProject || ADO_PROJECT;
      let adoRepoId = ADO_REPO_NAME
        ? await resolveRepoId(adoOrgUrl, WEBHOOK_ADO_PAT, adoProject, ADO_REPO_NAME)
        : undefined;
      if (!adoRepoId) {
        return res.status(400).json({ error: 'Could not resolve repository ID' });
      }

      result.aiSummaryStatus = 'generating';
      await analysisStore.set(result.id, result);
      res.json({ status: 'generating', message: 'AI summary retry started' });

      spawnAgencyReview({
        prId: result.prId,
        figmaUrl: result.figmaUrl,
        adoPat: WEBHOOK_ADO_PAT,
        figmaPat: WEBHOOK_FIGMA_PAT,
        adoOrgUrl,
        adoProject,
        adoRepoId,
      }).then(async (markdown) => {
        const updated = await analysisStore.get(result.id);
        if (updated) {
          updated.aiSummary = markdown;
          updated.aiSummaryStatus = 'completed';
          await analysisStore.set(result.id, updated);
        }
        console.log(`[agency] AI summary retry completed for analysis ${result.id}`);
        try {
          const reportPath = saveReport(markdown, result.prId);
          console.log(`[agency] Report saved to ${reportPath}`);
        } catch (saveErr) {
          console.warn('[agency] Failed to save report file:', saveErr);
        }
      }).catch(async (err) => {
        const updated = await analysisStore.get(result.id);
        if (updated) {
          updated.aiSummaryStatus = 'failed';
          await analysisStore.set(result.id, updated);
        }
        console.error(`[agency] AI summary retry failed for analysis ${result.id}:`, err);
      });
    } catch (err: any) {
      console.error('Retry AI error:', err);
      res.status(500).json({ error: err.message || 'Retry failed' });
    }
  });

  // GET /api/config/teams — return Figma team IDs with display names
  app.get('/api/config/teams', (_req, res) => {
    res.json({ teamIds: FIGMA_TEAM_IDS, teamNames: FIGMA_TEAM_NAMES });
  });

  // GET /api/reviews — return history
  app.get('/api/reviews', async (_req, res) => {
    const all = await reviewStore.list();
    res.json(all);
  });

  // --- Mount webhook router ---
  app.use('/api/webhooks', createWebhookRouter(analysisStore));

  // --- Mount MCP Streamable HTTP router ---
  if (WEBHOOK_ADO_PAT && WEBHOOK_FIGMA_PAT) {
    const mcpConfig: McpConfig = {
      adoToken: WEBHOOK_ADO_PAT,
      figmaToken: WEBHOOK_FIGMA_PAT,
      orgUrl: ADO_ORG_URL,
      project: ADO_PROJECT,
      repositoryId: '', // Will be resolved per-request if needed
      figmaTeamId: FIGMA_TEAM_IDS[0] || '',
    };
    app.use('/mcp', createMcpRouter(mcpConfig));
    console.log('[mcp] Streamable HTTP transport mounted at /mcp');
  }

  // SPA fallback
  app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });

  // Global unhandled rejection handler to prevent crashes
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
  });

  // Log resolved config (non-sensitive)
  console.log('[config] ADO_ORG_URL:', ADO_ORG_URL);
  console.log('[config] ADO_PROJECT:', ADO_PROJECT);
  console.log('[config] ADO_REPO_NAME:', ADO_REPO_NAME);
  console.log('[config] FIGMA_TEAM_IDS:', FIGMA_TEAM_IDS.join(', '));
  console.log('[config] STORAGE_BACKEND:', STORAGE_BACKEND);
  console.log('[config] WEBHOOK configured:', !!(WEBHOOK_ADO_PAT && WEBHOOK_FIGMA_PAT));

  const server = app.listen(PORT, () => {
    console.log(`Design Bridge API running at http://localhost:${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('[shutdown] SIGTERM received, closing server...');
    server.close(() => {
      console.log('[shutdown] Server closed');
      process.exit(0);
    });
  });
}

boot().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
