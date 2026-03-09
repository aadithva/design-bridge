/**
 * Self-contained test using mock Figma data to validate the full pipeline:
 * token extraction, POR detection, design spec generation.
 */
import { detectPorPage } from './services/figma/por-page-detector.js';
import { extractDesignTokens, deduplicateColors } from './services/figma/design-token-extractor.js';
import { parseFigmaUrls } from './services/pr-description-parser.js';
import { parseAndFilterDiff, getDiffSummary } from './services/code-analysis/diff-parser.js';
import { extractCodeTokens, mergeCodeTokens } from './services/code-analysis/style-extractor.js';
import { FigmaNode } from './services/figma/types.js';

// --- Mock Figma document ---
const mockDocument: FigmaNode = {
  id: '0:0',
  name: 'Document',
  type: 'DOCUMENT',
  children: [
    {
      id: '1:1',
      name: 'POR - Final Design',
      type: 'CANVAS',
      children: [
        {
          id: '2:1',
          name: 'Header Frame',
          type: 'FRAME',
          layoutMode: 'HORIZONTAL',
          itemSpacing: 16,
          paddingLeft: 24,
          paddingRight: 24,
          paddingTop: 12,
          paddingBottom: 12,
          cornerRadius: 8,
          absoluteBoundingBox: { x: 0, y: 0, width: 1200, height: 64 },
          fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 }, visible: true }],
          strokes: [{ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9, a: 1 }, visible: true }],
          children: [
            {
              id: '3:1',
              name: 'Title',
              type: 'TEXT',
              style: { fontFamily: 'Segoe UI', fontSize: 20, fontWeight: 600, lineHeightPx: 28 },
              fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.1, b: 0.1, a: 1 }, visible: true }],
            },
            {
              id: '3:2',
              name: 'Subtitle',
              type: 'TEXT',
              style: { fontFamily: 'Segoe UI', fontSize: 14, fontWeight: 400, lineHeightPx: 20 },
              fills: [{ type: 'SOLID', color: { r: 0.4, g: 0.4, b: 0.4, a: 1 }, visible: true }],
            },
          ],
        },
        {
          id: '2:2',
          name: 'Card Grid',
          type: 'FRAME',
          layoutMode: 'VERTICAL',
          itemSpacing: 12,
          paddingLeft: 16,
          paddingRight: 16,
          paddingTop: 16,
          paddingBottom: 16,
          absoluteBoundingBox: { x: 0, y: 64, width: 1200, height: 400 },
          children: [
            {
              id: '4:1',
              name: 'Button',
              type: 'INSTANCE',
              componentId: 'btn-primary',
              fills: [{ type: 'SOLID', color: { r: 0, g: 0.47, b: 0.84, a: 1 }, visible: true }],
              cornerRadius: 4,
            },
            {
              id: '4:2',
              name: 'Card',
              type: 'INSTANCE',
              componentId: 'card-default',
              cornerRadius: 8,
              fills: [{ type: 'SOLID', color: { r: 0.98, g: 0.98, b: 0.98, a: 1 }, visible: true }],
            },
            {
              id: '4:3',
              name: 'Button',
              type: 'INSTANCE',
              componentId: 'btn-primary',
            },
          ],
        },
      ],
    },
    {
      id: '1:2',
      name: 'WIP - Exploration',
      type: 'CANVAS',
      children: [],
    },
  ],
};

// --- Mock PR diff ---
const mockDiff = `diff --git a/src/components/Header.tsx b/src/components/Header.tsx
new file mode 100644
--- /dev/null
+++ b/src/components/Header.tsx
@@ -0,0 +1,30 @@
+import { Button, Card, Text } from '@fluentui/react-components';
+import { makeStyles, tokens } from '@fluentui/react-components';
+
+const useStyles = makeStyles({
+  header: {
+    display: 'flex',
+    flexDirection: 'row',
+    gap: '16px',
+    padding: '12px 24px',
+    borderRadius: '8px',
+    backgroundColor: '#ffffff',
+    borderBottom: '1px solid #e6e6e6',
+  },
+  title: {
+    fontSize: '20px',
+    fontWeight: 600,
+    color: '#1a1a1a',
+  },
+  subtitle: {
+    fontSize: '14px',
+    fontWeight: 400,
+    color: tokens.colorNeutralForeground2,
+  },
+  cardGrid: {
+    display: 'flex',
+    flexDirection: 'column',
+    gap: '12px',
+    padding: '16px',
+  },
+});
`;

function assert(condition: boolean, msg: string) {
  if (!condition) { console.error(`  ❌ FAIL: ${msg}`); process.exit(1); }
  console.log(`  ✅ ${msg}`);
}

async function main() {
  console.log('=== Design Review Bot — Pipeline Test ===\n');

  // Test 1: POR page detection
  console.log('[1] POR Page Detection');
  const porPage = detectPorPage(mockDocument);
  assert(porPage !== null, 'POR page detected');
  assert(porPage!.pageName === 'POR - Final Design', `Correct page: "${porPage!.pageName}"`);
  assert(porPage!.confidence > 0, `Confidence: ${porPage!.confidence}`);
  assert(porPage!.signals.length > 0, `Signals: ${porPage!.signals.join(', ')}`);

  // Test 2: Design token extraction
  console.log('\n[2] Design Token Extraction');
  const pageNode = mockDocument.children![0];
  const tokens = extractDesignTokens(pageNode);
  tokens.colors = deduplicateColors(tokens.colors);
  assert(tokens.colors.length > 0, `Colors: ${tokens.colors.length}`);
  assert(tokens.typography.length === 2, `Typography: ${tokens.typography.length} styles`);
  assert(tokens.spacing.length > 0, `Spacing: ${tokens.spacing.length} values`);
  assert(tokens.borderRadius.length > 0, `Border radius: ${tokens.borderRadius.length} values`);
  assert(tokens.components.length === 2, `Components: ${tokens.components.map(c => `${c.name}(×${c.instanceCount})`).join(', ')}`);

  // Verify specific tokens
  const hasWhite = tokens.colors.some(c => c.hex === '#ffffff');
  assert(hasWhite, 'Found background white (#ffffff)');
  const blueBtn = tokens.colors.find(c => c.hex.startsWith('#00'));
  assert(!!blueBtn, `Found button blue (${blueBtn?.hex})`);
  const title = tokens.typography.find(t => t.fontSize === 20);
  assert(!!title, `Title typography: ${title?.fontFamily} ${title?.fontSize}px/${title?.fontWeight}`);

  // Test 3: Figma URL parsing
  console.log('\n[3] Figma URL Parsing');
  const desc = 'Design: https://www.figma.com/design/ABC123xyz/My-Design?node-id=1-2&t=xxx';
  const urls = parseFigmaUrls(desc);
  assert(urls.length === 1, `Parsed ${urls.length} URL`);
  assert(urls[0].fileKey === 'ABC123xyz', `File key: ${urls[0].fileKey}`);
  assert(urls[0].nodeId === '1:2', `Node ID: ${urls[0].nodeId}`);

  // Test 4: Diff parsing & code token extraction
  console.log('\n[4] Code Analysis');
  const uiFiles = parseAndFilterDiff(mockDiff);
  assert(uiFiles.length === 1, `UI files: ${uiFiles.length}`);
  assert(uiFiles[0].path.includes('Header.tsx'), `File: ${uiFiles[0].path}`);
  assert(uiFiles[0].additions.length > 0, `Additions: ${uiFiles[0].additions.length} lines`);

  const summary = getDiffSummary(uiFiles);
  assert(summary.totalFiles === 1, `Summary: ${summary.totalFiles} files, ${summary.totalAdditions} additions`);

  const codeTokenSets = uiFiles.map(f => extractCodeTokens(f.additions, f.path));
  const codeTokens = mergeCodeTokens(codeTokenSets);
  assert(codeTokens.colors.length > 0, `Code colors: ${codeTokens.colors.length}`);
  assert(codeTokens.spacing.length > 0, `Code spacing: ${codeTokens.spacing.length}`);
  assert(codeTokens.typography.length > 0, `Code typography: ${codeTokens.typography.length}`);
  assert(codeTokens.components.length > 0, `Code components: ${codeTokens.components.map(c => c.name).join(', ')}`);

  // Verify specific code tokens
  const hasFluentImport = codeTokens.components.some(c => c.name === 'Button');
  assert(hasFluentImport, 'Found Fluent Button import');
  const hasTokenRef = codeTokens.colors.some(c => c.value.includes('tokens.'));
  assert(hasTokenRef, 'Found Fluent token reference');

  console.log('\n=== All pipeline tests passed! ===\n');

  // Print what the LLM would receive
  console.log('--- Preview: Data that would be sent to LLM ---');
  console.log(`Design tokens: ${tokens.colors.length} colors, ${tokens.typography.length} typography, ${tokens.spacing.length} spacing`);
  console.log(`Code tokens: ${codeTokens.colors.length} colors, ${codeTokens.typography.length} typography, ${codeTokens.spacing.length} spacing`);
  console.log(`Components in design: ${tokens.components.map(c => c.name).join(', ')}`);
  console.log(`Components in code: ${codeTokens.components.map(c => c.name).join(', ')}`);
}

main();
