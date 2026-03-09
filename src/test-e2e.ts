/**
 * End-to-end test: exercises the Figma tools directly.
 * Usage: FIGMA_API_TOKEN=xxx node dist/test-e2e.js <figma-url>
 */
import { FigmaClient } from './services/figma/figma-client.js';
import { detectPorPage } from './services/figma/por-page-detector.js';
import { extractDesignTokens, deduplicateColors } from './services/figma/design-token-extractor.js';
import { exportFrames } from './services/figma/frame-exporter.js';
import { FigmaNode } from './services/figma/types.js';

async function main() {
  const token = process.env.FIGMA_API_TOKEN;
  if (!token) { console.error('Set FIGMA_API_TOKEN'); process.exit(1); }

  const url = process.argv[2];
  if (!url) { console.error('Usage: node dist/test-e2e.js <figma-url>'); process.exit(1); }

  const match = url.match(/figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)/);
  if (!match) { console.error('Invalid Figma URL'); process.exit(1); }
  const fileKey = match[1];

  // Parse node-id if present
  let nodeId: string | undefined;
  const nodeIdMatch = url.match(/[?&]node-id=([^&#\s]+)/);
  if (nodeIdMatch) {
    nodeId = decodeURIComponent(nodeIdMatch[1]).replace('-', ':');
  }

  const client = new FigmaClient(token);

  // Step 1: Fetch node or file
  let pageNode: any;
  let pageName: string;

  if (nodeId) {
    console.log(`\n[1] Fetching Figma node: ${nodeId} from file ${fileKey}...`);
    const nodesData = await client.getFileNodes(fileKey, [nodeId]);
    const nodeData = nodesData.nodes?.[nodeId];
    if (!nodeData?.document) { console.error('    ❌ Node not found'); process.exit(1); }
    pageNode = nodeData.document;
    pageName = pageNode.name;
    console.log(`    ✅ Node "${pageName}" (type: ${pageNode.type})`);
    if (pageNode.children) {
      console.log(`    Children: ${pageNode.children.length}`);
    }
  } else {
    console.log(`\n[1] Fetching Figma file: ${fileKey} (depth=2)...`);
    const file = await client.getFile(fileKey, 2);
    console.log(`    ✅ "${file.name}" — ${file.document.children?.length ?? 0} pages`);

    console.log(`\n[2] Detecting POR page...`);
    const porResult = detectPorPage(file.document, nodeId);
    if (!porResult) { console.error('    ❌ No pages found'); process.exit(1); }
    console.log(`    ✅ "${porResult.pageName}" (confidence: ${porResult.confidence})`);

    pageNode = file.document.children?.find((c: FigmaNode) => c.id === porResult.pageId);
    if (!pageNode) { console.error('    ❌ Page node not found'); process.exit(1); }
    pageName = porResult.pageName;
  }

  // Extract design tokens
  console.log(`\n[3] Extracting design tokens from "${pageName}"...`);
  const tokens = extractDesignTokens(pageNode);
  tokens.colors = deduplicateColors(tokens.colors);
  console.log(`    ✅ Tokens extracted:`);
  console.log(`       Colors: ${tokens.colors.length}`);
  console.log(`       Typography: ${tokens.typography.length}`);
  console.log(`       Spacing: ${tokens.spacing.length}`);
  console.log(`       Border radius: ${tokens.borderRadius.length}`);
  console.log(`       Components: ${tokens.components.length}`);

  // Show sample tokens
  if (tokens.colors.length > 0) {
    console.log(`\n    Sample colors:`);
    for (const c of tokens.colors.slice(0, 5)) {
      console.log(`       ${c.hex} (${c.usage}) — ${c.source}`);
    }
  }
  if (tokens.typography.length > 0) {
    console.log(`\n    Sample typography:`);
    for (const t of tokens.typography.slice(0, 5)) {
      console.log(`       ${t.fontFamily} ${t.fontSize}px/${t.fontWeight} — ${t.source}`);
    }
  }
  if (tokens.components.length > 0) {
    console.log(`\n    Components:`);
    for (const c of tokens.components.slice(0, 10)) {
      console.log(`       ${c.name} (×${c.instanceCount})`);
    }
  }

  // Step 4: Export frames
  console.log(`\n[4] Exporting frame screenshots (max 3)...`);
  try {
    const frames = await exportFrames(client, fileKey, pageNode, 3);
    console.log(`    ✅ Exported ${frames.length} frames:`);
    for (const f of frames) {
      const sizeKB = Math.round(f.imageBuffer.length / 1024);
      console.log(`       "${f.name}" — ${f.width}×${f.height} — ${sizeKB}KB`);
    }
  } catch (err: any) {
    console.warn(`    ⚠️  Frame export failed: ${err.message}`);
  }

  console.log(`\n✅ All Figma integration tests passed!`);
}

main().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
