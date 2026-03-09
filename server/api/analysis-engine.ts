import { randomUUID } from 'node:crypto';
import { FigmaClient } from '../services/figma/figma-client.js';
import { PrFetcher } from '../services/ado/pr-fetcher.js';
import {
  extractComponentSpec,
  findMatchingComponents,
  findFocusedComponents,
  compareComponentSet,
  parseCodeStyles,
  compareComponent,
  deriveSearchTerms,
  type ComponentComparison,
} from '../services/comparison/component-matcher.js';
import type { AnalysisResult } from './types.js';
import { detectPorPage } from '../services/figma/por-page-detector.js';
import { enumeratePageScenarios } from '../services/figma/scenario-enumerator.js';
import type { FigmaPageManifest } from '../services/figma/types.js';

export function parseFigmaUrl(url: string): { fileKey: string; nodeId?: string } {
  const fileKeyMatch = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (!fileKeyMatch) throw new Error('Invalid Figma URL');
  const fileKey = fileKeyMatch[1];
  let nodeId: string | undefined;
  const nodeIdMatch = url.match(/[?&]node-id=([^&#\s]+)/);
  if (nodeIdMatch) nodeId = decodeURIComponent(nodeIdMatch[1]).replaceAll('-', ':');
  return { fileKey, nodeId };
}

type Severity = 'error' | 'warning' | 'info' | 'pass';

function computeSeverity(findings: { severity: string }[]): Severity {
  const order: Record<string, number> = { error: 3, warning: 2, info: 1, pass: 0 };
  let max: Severity = 'pass';
  for (const f of findings) {
    if ((order[f.severity] ?? 0) > (order[max] ?? 0)) {
      max = f.severity as Severity;
    }
  }
  return max;
}

export function runComparison(
  figmaNode: any,
  codeFiles: Array<{ path: string; content: string }>,
  manifest?: FigmaPageManifest,
): {
  components: ComponentComparison[];
  summary: { errors: number; warnings: number; info: number; passes: number };
} {
  const components: ComponentComparison[] = [];

  // Collect all search terms and combined code across all files
  const allTerms = new Set<string>();
  const allCodeContent: string[] = [];
  for (const file of codeFiles) {
    const terms = deriveSearchTerms(file.path, file.content);
    for (const t of terms) allTerms.add(t);
    allCodeContent.push(file.content);
  }
  const combinedCode = allCodeContent.join('\n');

  // Focused path: use manifest when available
  if (manifest && (manifest.variantGroups.length > 0 || manifest.componentNames.length > 0) && allTerms.size > 0) {
    const focused = findFocusedComponents(figmaNode, manifest, [...allTerms]);

    if (focused.length > 0) {
      const codeStyles = parseCodeStyles(combinedCode);

      for (const match of focused) {
        const figmaSpec = extractComponentSpec(match.node);
        const findings = compareComponent(match.componentName, figmaSpec, codeStyles);

        // Add variant coverage findings for COMPONENT_SET nodes
        let variantCount: number | undefined;
        let variantsCovered: number | undefined;
        let variantDetails: ComponentComparison['variantDetails'];

        if (match.variantGroup) {
          const variantFindings = compareComponentSet(match.componentName, match.variantGroup, combinedCode);
          findings.push(...variantFindings);
          variantCount = match.variantGroup.variants.length;

          // Count covered variants
          const coveredSet = new Set<string>();
          for (const v of match.variantGroup.variants) {
            const valLower = Object.values(v.properties).join(' ').toLowerCase();
            if (combinedCode.toLowerCase().includes(valLower) || valLower.includes('default')) {
              coveredSet.add(v.nodeId);
            }
          }
          variantsCovered = coveredSet.size;

          variantDetails = match.variantGroup.variants.map(v => ({
            name: v.name,
            properties: v.properties,
            covered: coveredSet.has(v.nodeId),
          }));
        }

        components.push({
          componentName: match.componentName,
          figmaNodeId: match.node.id,
          figmaPath: match.path,
          findings,
          overallStatus: computeSeverity(findings),
          componentType: match.componentType,
          sectionName: match.sectionName,
          variantCount,
          variantsCovered,
          variantDetails,
        });
      }

      return {
        components,
        summary: {
          errors: components.flatMap(c => c.findings).filter(f => f.severity === 'error').length,
          warnings: components.flatMap(c => c.findings).filter(f => f.severity === 'warning').length,
          info: components.flatMap(c => c.findings).filter(f => f.severity === 'info').length,
          passes: components.flatMap(c => c.findings).filter(f => f.severity === 'pass').length,
        },
      };
    }
  }

  // Fallback: existing layer-by-layer matching
  for (const file of codeFiles) {
    const searchTerms = deriveSearchTerms(file.path, file.content);
    if (searchTerms.length === 0) continue;

    const matches = findMatchingComponents(figmaNode, searchTerms);
    if (matches.length === 0) continue;

    const codeStyles = parseCodeStyles(file.content);
    const seen = new Set<string>();

    for (const match of matches) {
      if (match.node.type !== 'INSTANCE' && match.node.type !== 'COMPONENT' && match.node.type !== 'FRAME') continue;
      const key = match.node.name;
      if (seen.has(key)) continue;
      seen.add(key);

      const figmaSpec = extractComponentSpec(match.node);
      const findings = compareComponent(match.node.name, figmaSpec, codeStyles);

      components.push({
        componentName: match.node.name,
        figmaNodeId: match.node.id,
        figmaPath: match.path,
        findings,
        overallStatus: computeSeverity(findings),
      });
    }
  }

  const summary = {
    errors: components.flatMap(c => c.findings).filter(f => f.severity === 'error').length,
    warnings: components.flatMap(c => c.findings).filter(f => f.severity === 'warning').length,
    info: components.flatMap(c => c.findings).filter(f => f.severity === 'info').length,
    passes: components.flatMap(c => c.findings).filter(f => f.severity === 'pass').length,
  };

  return { components, summary };
}

export async function runAnalysis(params: {
  figmaUrl: string;
  figmaPat: string;
  prId?: number;
  adoOrgUrl?: string;
  adoProject?: string;
  adoRepoId?: string;
  adoPat?: string;
}): Promise<AnalysisResult> {
  const id = randomUUID();
  const createdAt = new Date().toISOString();

  try {
    const { fileKey, nodeId } = parseFigmaUrl(params.figmaUrl);
    const figmaClient = new FigmaClient(params.figmaPat);

    // Step 1: Fetch Figma data
    let figmaNode: any;
    let pageName: string;

    try {
      if (nodeId) {
        const nodesData = await figmaClient.getFileNodes(fileKey, [nodeId]);
        const nodeData = nodesData.nodes?.[nodeId];
        if (!nodeData?.document) throw new Error(`Figma node ${nodeId} not found`);
        figmaNode = nodeData.document;
        pageName = figmaNode.name;
      } else {
        const file = await figmaClient.getFile(fileKey, 2);
        const porPage = detectPorPage(file.document);
        if (porPage) {
          // Re-fetch the POR page with full depth via getFileNodes
          const nodesData = await figmaClient.getFileNodes(fileKey, [porPage.pageId]);
          const nodeData = nodesData.nodes?.[porPage.pageId];
          if (nodeData?.document) {
            figmaNode = nodeData.document;
            pageName = porPage.pageName;
          } else {
            figmaNode = file.document;
            pageName = file.name;
          }
        } else {
          figmaNode = file.document;
          pageName = file.name;
        }
      }
    } catch (err: any) {
      throw new Error(`Figma fetch failed: ${err.message}`);
    }

    // Step 2: Fetch full file content from PR
    let codeFiles: Array<{ path: string; content: string }> = [];
    let prTitle = 'Manual Review';
    let repoName = '';

    if (params.prId && params.adoPat && params.adoOrgUrl && params.adoProject && params.adoRepoId) {
      try {
        const fetcher = new PrFetcher(params.adoOrgUrl, params.adoPat);
        const prInfo = await fetcher.getPrInfo(params.adoRepoId, params.prId, params.adoProject);
        prTitle = prInfo.title;
        repoName = (prInfo as any).repository?.name || '';

        const fullFiles = await fetcher.getPrFullFiles(params.adoRepoId, params.prId, params.adoProject);
        codeFiles = fullFiles
          .filter((f: any) => f.changeType !== 'delete')
          .map((f: any) => ({ path: f.path, content: f.content }));
      } catch (adoErr: any) {
        console.error('ADO fetch error (continuing without PR data):', adoErr.message);
      }
    }

    // Step 3: Enumerate page scenarios for focused matching
    const manifest = enumeratePageScenarios(figmaNode, 3);

    // Step 4: Run comparison with manifest for smart component-level analysis
    const { components, summary } = runComparison(figmaNode, codeFiles, manifest);

    return {
      id,
      status: 'completed',
      createdAt,
      figmaUrl: params.figmaUrl,
      figmaPageName: pageName,
      prTitle,
      prId: params.prId || 0,
      adoProject: params.adoProject || '',
      repoName,
      components,
      summary,
      codeFiles: codeFiles.map(f => f.path),
    };
  } catch (err: any) {
    console.error(`[runAnalysis] Analysis failed for ${params.figmaUrl}:`, err.message);
    return {
      id,
      status: 'failed',
      createdAt,
      figmaUrl: params.figmaUrl,
      figmaPageName: '',
      prTitle: '',
      prId: params.prId || 0,
      adoProject: params.adoProject || '',
      repoName: '',
      components: [],
      summary: { errors: 0, warnings: 0, info: 0, passes: 0 },
      codeFiles: [],
      error: err.message || 'Analysis failed',
    };
  }
}
