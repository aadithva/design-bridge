import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { PrFetcher, PrFullFile } from '../services/ado/pr-fetcher.js';
import { CommentPoster } from '../services/ado/comment-poster.js';
import { parseAndFilterDiff, getDiffSummary } from '../services/code-analysis/diff-parser.js';
import { extractCodeTokens, mergeCodeTokens } from '../services/code-analysis/style-extractor.js';
import { deriveSearchTerms } from '../services/comparison/component-matcher.js';
import { parseFigmaUrls } from '../services/pr-description-parser.js';
import { runAnalysis, runComparison } from '../api/analysis-engine.js';
import { DiscoveryService } from '../services/ado/discovery-service.js';
import { ADO_REPO_NAME } from '../api/config.js';

interface Config {
  adoToken: string;
  figmaToken?: string;
  orgUrl: string;
  project: string;
  repositoryId: string;
}

// Cached repo ID resolution
let resolvedRepoId: string | undefined;
async function getRepoId(config: Config): Promise<string> {
  if (config.repositoryId) return config.repositoryId;
  if (resolvedRepoId) return resolvedRepoId;
  if (ADO_REPO_NAME) {
    const service = new DiscoveryService(config.orgUrl, config.adoToken);
    const repos = await service.getRepositories(config.project);
    const match = repos.find(r => r.name.toLowerCase() === ADO_REPO_NAME.toLowerCase());
    if (match) {
      resolvedRepoId = match.id;
      return match.id;
    }
  }
  throw new Error('No ADO_REPOSITORY_ID configured and could not resolve from ADO_REPO_NAME');
}

export function registerPrTools(server: McpServer, config: Config): void {
  server.tool(
    'get_pr_info',
    'Fetch PR title, description, and any Figma URLs found in the description',
    { pr_id: z.number().describe('ADO Pull Request ID') },
    async ({ pr_id }) => {
      const repoId = await getRepoId(config);
      const fetcher = new PrFetcher(config.orgUrl, config.adoToken);
      const prInfo = await fetcher.getPrInfo(repoId, pr_id, config.project);
      const figmaUrls = parseFigmaUrls(prInfo.description);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            pullRequestId: prInfo.pullRequestId,
            title: prInfo.title,
            description: prInfo.description,
            figmaUrls: figmaUrls.map((u) => ({
              fileKey: u.fileKey,
              nodeId: u.nodeId,
              rawUrl: u.rawUrl,
            })),
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'get_pr_code_changes',
    'Fetch the PR diff filtered to UI-relevant files (.tsx, .jsx, .css, .styles.ts, etc.)',
    { pr_id: z.number().describe('ADO Pull Request ID') },
    async ({ pr_id }) => {
      const fetcher = new PrFetcher(config.orgUrl, config.adoToken);
      const repoId = await getRepoId(config);
      const rawDiff = await fetcher.getPrDiff(repoId, pr_id, config.project);
      const uiFiles = parseAndFilterDiff(rawDiff);
      const diffSummary = getDiffSummary(uiFiles);
      const codeTokenSets = uiFiles.map((f) => extractCodeTokens(f.additions, f.path));
      const codeTokens = mergeCodeTokens(codeTokenSets);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            summary: diffSummary,
            files: uiFiles.map((f) => ({
              path: f.path,
              additions: f.additions,
              deletions: f.deletions,
            })),
            extractedTokens: {
              colors: codeTokens.colors.slice(0, 100),
              spacing: codeTokens.spacing.slice(0, 100),
              typography: codeTokens.typography.slice(0, 50),
              components: codeTokens.components,
            },
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'get_pr_full_code',
    'Fetch the FULL content of all UI-relevant files touched by a PR (not just diff lines). Use this for feature-level design review.',
    { pr_id: z.number().describe('ADO Pull Request ID') },
    async ({ pr_id }) => {
      const fetcher = new PrFetcher(config.orgUrl, config.adoToken);
      const repoId = await getRepoId(config);
      const fullFiles = await fetcher.getPrFullFiles(repoId, pr_id, config.project);

      const allTokenSets = fullFiles
        .filter(f => f.changeType !== 'delete')
        .map(f => extractCodeTokens(f.content.split('\n'), f.path));
      const codeTokens = mergeCodeTokens(allTokenSets);

      const componentNames = new Set<string>();
      for (const f of fullFiles) {
        if (f.changeType === 'delete') continue;
        const terms = deriveSearchTerms(f.path, f.content);
        terms.forEach(t => componentNames.add(t));
      }

      const totalLines = fullFiles.reduce((sum, f) => sum + f.content.split('\n').length, 0);

      // Include heuristic comparison results if a Figma token is available
      let heuristicResults: any = undefined;
      if (config.figmaToken) {
        try {
          // Check if there's a Figma URL in the PR description
          const prInfo = await fetcher.getPrInfo(repoId, pr_id, config.project);
          const figmaUrls = parseFigmaUrls(prInfo.description);
          if (figmaUrls.length > 0) {
            const analysis = await runAnalysis({
              figmaUrl: figmaUrls[0].rawUrl,
              figmaPat: config.figmaToken,
              prId: pr_id,
              adoOrgUrl: config.orgUrl,
              adoProject: config.project,
              adoRepoId: repoId,
              adoPat: config.adoToken,
            });
            if (analysis.status === 'completed') {
              heuristicResults = {
                components: analysis.components,
                summary: analysis.summary,
              };
            }
          }
        } catch {
          // Heuristic comparison is best-effort
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            summary: {
              fileCount: fullFiles.length,
              totalLines,
              changeTypes: {
                added: fullFiles.filter(f => f.changeType === 'add').length,
                edited: fullFiles.filter(f => f.changeType === 'edit').length,
                deleted: fullFiles.filter(f => f.changeType === 'delete').length,
              },
            },
            files: fullFiles.map(f => ({
              path: f.path,
              fullContent: f.content,
              changeType: f.changeType,
            })),
            extractedTokens: {
              colors: codeTokens.colors.slice(0, 100),
              spacing: codeTokens.spacing.slice(0, 100),
              typography: codeTokens.typography.slice(0, 50),
              components: codeTokens.components,
            },
            componentNames: Array.from(componentNames),
            ...(heuristicResults ? { heuristicComparison: heuristicResults } : {}),
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'post_review_comment',
    'Post or update the design review comment on the PR (idempotent)',
    {
      pr_id: z.number().describe('ADO Pull Request ID'),
      content: z.string().describe('Markdown content for the review comment'),
    },
    async ({ pr_id, content }) => {
      const poster = new CommentPoster(config.orgUrl, config.adoToken);
      const repoId = await getRepoId(config);
      await poster.postOrUpdateComment(repoId, pr_id, config.project, content);
      return {
        content: [{
          type: 'text' as const,
          text: `Design review comment posted/updated on PR #${pr_id}`,
        }],
      };
    }
  );

  server.tool(
    'save_report',
    'Save the design review report as a local markdown file',
    {
      content: z.string().describe('Markdown content of the review report'),
      pr_id: z.number().optional().describe('Optional PR ID for the filename'),
    },
    async ({ content, pr_id }) => {
      const reportsDir = join(process.cwd(), 'reports');
      mkdirSync(reportsDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const prSuffix = pr_id ? `-PR${pr_id}` : '';
      const filename = `review${prSuffix}-${timestamp}.md`;
      const filepath = join(reportsDir, filename);
      writeFileSync(filepath, content, 'utf-8');
      return {
        content: [{
          type: 'text' as const,
          text: `Report saved to ${filepath}`,
        }],
      };
    }
  );
}
