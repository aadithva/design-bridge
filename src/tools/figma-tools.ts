import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FigmaClient } from '../services/figma/figma-client.js';
import { detectPorPage, detectRelevantPages } from '../services/figma/por-page-detector.js';
import { extractDesignTokens, deduplicateColors } from '../services/figma/design-token-extractor.js';
import { exportFrames } from '../services/figma/frame-exporter.js';
import { enumeratePageScenarios } from '../services/figma/scenario-enumerator.js';
import { FigmaNode } from '../services/figma/types.js';

interface Config {
  figmaToken: string;
  figmaTeamId?: string;
}

function parseFigmaUrl(figmaUrl: string): { fileKey: string; nodeId?: string } {
  const fileKeyMatch = figmaUrl.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (!fileKeyMatch) {
    throw new Error(`Invalid Figma URL: ${figmaUrl}`);
  }
  const fileKey = fileKeyMatch[1];

  let nodeId: string | undefined;
  const nodeIdMatch = figmaUrl.match(/[?&]node-id=([^&#\s]+)/);
  if (nodeIdMatch) {
    nodeId = decodeURIComponent(nodeIdMatch[1]).replace('-', ':');
  }

  return { fileKey, nodeId };
}

export function registerFigmaTools(server: McpServer, config: Config): void {
  server.tool(
    'get_figma_design_spec',
    'Fetch a Figma file, detect the POR page, and extract structured design tokens',
    {
      figma_url: z.string().describe('Figma file URL (e.g., https://www.figma.com/design/ABC123/...)'),
    },
    async ({ figma_url }) => {
      const { fileKey, nodeId } = parseFigmaUrl(figma_url);
      const client = new FigmaClient(config.figmaToken);

      let porPage: any;
      let pageNode: FigmaNode;

      if (nodeId) {
        // Fetch only the specific node — much faster for large files
        const nodesData = await client.getFileNodes(fileKey, [nodeId]);
        const nodeData = nodesData.nodes?.[nodeId];
        if (!nodeData?.document) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Node ${nodeId} not found in file` }) }] };
        }
        pageNode = nodeData.document;
        porPage = {
          pageId: nodeId,
          pageName: pageNode.name,
          confidence: 100,
          signals: ['node-id override from URL'],
        };
      } else {
        // No node-id: fetch file structure (depth=2 for speed) and detect POR page
        const figmaFile = await client.getFile(fileKey, 2);
        porPage = detectPorPage(figmaFile.document, nodeId);
        if (!porPage) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No pages found in Figma file' }) }] };
        }
        pageNode = figmaFile.document.children?.find((c: FigmaNode) => c.id === porPage.pageId)!;
        if (!pageNode) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Could not find POR page node' }) }] };
        }
      }

      const designTokens = extractDesignTokens(pageNode);
      designTokens.colors = deduplicateColors(designTokens.colors);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            porPage: {
              pageId: porPage.pageId,
              pageName: porPage.pageName,
              confidence: porPage.confidence,
              signals: porPage.signals,
            },
            tokens: {
              colors: designTokens.colors,
              typography: designTokens.typography,
              spacing: designTokens.spacing,
              borderRadius: designTokens.borderRadius,
              components: designTokens.components,
            },
            summary: {
              uniqueColors: designTokens.colors.length,
              typographyStyles: designTokens.typography.length,
              spacingValues: designTokens.spacing.length,
              borderRadiusValues: designTokens.borderRadius.length,
              componentTypes: designTokens.components.length,
            },
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'get_figma_screenshots',
    'Export top-level frames from the Figma POR page as PNG images for visual analysis',
    {
      figma_url: z.string().describe('Figma file URL'),
      max_frames: z.number().optional().default(10).describe('Maximum frames to export (default: 10)'),
    },
    async ({ figma_url, max_frames }) => {
      const { fileKey, nodeId } = parseFigmaUrl(figma_url);
      const client = new FigmaClient(config.figmaToken);

      let pageNode: FigmaNode;
      let pageName: string;

      if (nodeId) {
        // Fetch only the specific node
        const nodesData = await client.getFileNodes(fileKey, [nodeId]);
        const nodeData = nodesData.nodes?.[nodeId];
        if (!nodeData?.document) {
          return { content: [{ type: 'text' as const, text: `Node ${nodeId} not found` }] };
        }
        pageNode = nodeData.document;
        pageName = pageNode.name;
      } else {
        const figmaFile = await client.getFile(fileKey, 2);
        const porPage = detectPorPage(figmaFile.document, nodeId);
        if (!porPage) {
          return { content: [{ type: 'text' as const, text: 'No pages found in Figma file' }] };
        }
        pageNode = figmaFile.document.children?.find((c: FigmaNode) => c.id === porPage.pageId)!;
        pageName = porPage.pageName;
        if (!pageNode) {
          return { content: [{ type: 'text' as const, text: 'Could not find POR page node' }] };
        }
      }

      const frames = await exportFrames(client, fileKey, pageNode, max_frames);
      if (frames.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No frames found on POR page' }] };
      }

      const content: Array<{ type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }> = [];
      content.push({ type: 'text' as const, text: `Exported ${frames.length} frames from "${pageName}"` });

      // Include frame metadata summary for AI reasoning
      const frameMetadata = frames.map(f => ({
        name: f.name,
        nodeId: f.nodeId,
        width: f.width,
        height: f.height,
      }));
      content.push({ type: 'text' as const, text: `\nFrame metadata:\n${JSON.stringify(frameMetadata, null, 2)}` });

      for (const frame of frames) {
        content.push({ type: 'text' as const, text: `\n--- Frame: "${frame.name}" (${frame.width}×${frame.height}, nodeId: ${frame.nodeId}) ---` });
        content.push({ type: 'image' as const, data: frame.imageBuffer.toString('base64'), mimeType: 'image/png' });
      }

      return { content };
    }
  );

  server.tool(
    'search_figma_files',
    'Search for Figma files by name across all projects in a team',
    {
      team_id: z.string().describe('Figma team ID (numeric string)'),
      query: z.string().describe('Search query (e.g., "inline citation")'),
      max_results: z.number().optional().default(10).describe('Maximum results to return (default: 10)'),
    },
    async ({ team_id, query, max_results }) => {
      const client = new FigmaClient(config.figmaToken);
      const results = await client.searchFiles(team_id, query, max_results);

      if (results.length === 0) {
        return {
          content: [{ type: 'text' as const, text: JSON.stringify({ results: [], message: `No files matching "${query}" found in team ${team_id}` }) }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            results: results.map((r) => ({
              fileKey: r.fileKey,
              name: r.name,
              projectName: r.projectName,
              figmaUrl: r.figmaUrl,
              lastModified: r.lastModified,
              relevanceScore: r.relevanceScore,
            })),
            totalFound: results.length,
          }, null, 2),
        }],
      };
    }
  );

  server.tool(
    'enumerate_figma_scenarios',
    'Enumerate all scenarios/components on a Figma page (POR or Redlines) for completeness checking',
    {
      figma_url: z.string().describe('Figma file URL'),
    },
    async ({ figma_url }) => {
      const { fileKey, nodeId } = parseFigmaUrl(figma_url);
      const client = new FigmaClient(config.figmaToken);

      let pageNode: FigmaNode;
      let pageInfo: { pageId: string; pageName: string; pageType: string };

      if (nodeId) {
        const nodesData = await client.getFileNodes(fileKey, [nodeId]);
        const nodeData = nodesData.nodes?.[nodeId];
        if (!nodeData?.document) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: `Node ${nodeId} not found in file` }) }] };
        }
        pageNode = nodeData.document;
        pageInfo = { pageId: nodeId, pageName: pageNode.name, pageType: 'specified' };
      } else {
        // Fetch at depth 4 for richer enumeration
        const figmaFile = await client.getFile(fileKey, 4);
        const relevant = detectRelevantPages(figmaFile.document);

        // Prefer redlines page, fall back to POR page
        const targetPage = relevant.redlinesPage ?? relevant.porPage;
        if (!targetPage) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'No pages found in Figma file' }) }] };
        }

        pageNode = figmaFile.document.children?.find((c: FigmaNode) => c.id === targetPage.pageId)!;
        if (!pageNode) {
          return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'Could not find target page node' }) }] };
        }

        const pageType = relevant.redlinesPage && targetPage === relevant.redlinesPage ? 'redlines' : 'por';
        pageInfo = { pageId: targetPage.pageId, pageName: targetPage.pageName, pageType };
      }

      const manifest = enumeratePageScenarios(pageNode);

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            page: pageInfo,
            totalScenarios: manifest.totalCount,
            componentNames: manifest.componentNames,
            variantGroups: manifest.variantGroups.map((vg) => ({
              componentSet: vg.componentSetName,
              variantCount: vg.variants.length,
              variants: vg.variants.map((v) => ({
                name: v.name,
                properties: v.properties,
              })),
            })),
            scenarios: manifest.scenarios.map(function formatScenario(s): any {
              return {
                name: s.name,
                type: s.type,
                nodeId: s.nodeId,
                componentName: s.componentName,
                variantProperties: s.variantProperties,
                children: s.children.map(formatScenario),
              };
            }),
          }, null, 2),
        }],
      };
    }
  );
}
