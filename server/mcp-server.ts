#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerPrTools } from './tools/pr-tools.js';
import { registerFigmaTools } from './tools/figma-tools.js';
import { registerAnalysisTools } from './tools/analysis-tools.js';

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export interface McpConfig {
  adoToken: string;
  figmaToken: string;
  orgUrl: string;
  project: string;
  repositoryId: string;
  figmaTeamId: string;
}

/**
 * Create and configure the MCP server with all tools registered.
 * Used by both stdio mode (local CLI) and HTTP transport (deployed server).
 */
export function createMcpServer(config: McpConfig): McpServer {
  const server = new McpServer({
    name: 'design-review-mcp',
    version: '2.0.0',
  });

  registerPrTools(server, config);
  registerFigmaTools(server, config);
  registerAnalysisTools(server, config);

  return server;
}

// When run directly (stdio mode for local CLI usage)
const isDirectRun = process.argv[1]?.endsWith('mcp-server.js');

if (isDirectRun) {
  // Load config from environment — uses lazy getters so env vars are read at call time
  const config: McpConfig = {
    get adoToken() { return getRequiredEnv('AZURE_PERSONAL_ACCESS_TOKEN'); },
    get figmaToken() { return getRequiredEnv('FIGMA_API_TOKEN'); },
    get orgUrl() { return getRequiredEnv('ADO_ORG_URL'); },
    get project() { return getRequiredEnv('ADO_PROJECT'); },
    get repositoryId() { return process.env['ADO_REPOSITORY_ID'] ?? ''; },
    get figmaTeamId() { return process.env['FIGMA_TEAM_ID'] ?? ''; },
  };

  const server = createMcpServer(config);

  async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Design Review MCP server started');
  }

  main().catch((err) => {
    console.error('Failed to start MCP server:', err);
    process.exit(1);
  });
}
