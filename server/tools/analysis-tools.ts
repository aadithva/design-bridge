import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { runAnalysis } from '../api/analysis-engine.js';
import { DiscoveryService } from '../services/ado/discovery-service.js';
import { ADO_REPO_NAME } from '../api/config.js';

interface AnalysisConfig {
  adoToken: string;
  figmaToken: string;
  orgUrl: string;
  project: string;
  repositoryId: string;
}

let resolvedRepoId: string | undefined;
async function getRepoId(config: AnalysisConfig): Promise<string> {
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

export function registerAnalysisTools(server: McpServer, config: AnalysisConfig): void {
  server.tool(
    'run_full_analysis',
    'Run complete Figma-to-code design review — fetches Figma data, PR code, and runs heuristic comparison in one call',
    {
      figma_url: z.string().describe('Figma file URL (e.g., https://www.figma.com/design/ABC123/...)'),
      pr_id: z.number().describe('ADO Pull Request ID'),
    },
    async ({ figma_url, pr_id }) => {
      const repoId = await getRepoId(config);
      const result = await runAnalysis({
        figmaUrl: figma_url,
        figmaPat: config.figmaToken,
        prId: pr_id,
        adoOrgUrl: config.orgUrl,
        adoProject: config.project,
        adoRepoId: repoId,
        adoPat: config.adoToken,
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );
}
