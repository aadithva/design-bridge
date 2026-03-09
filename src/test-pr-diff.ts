import { PrFetcher } from './services/ado/pr-fetcher.js';
import { parseAndFilterDiff, getDiffSummary } from './services/code-analysis/diff-parser.js';

async function main() {
  const orgUrl = 'https://dev.azure.com/office';
  const token = process.env.AZURE_PERSONAL_ACCESS_TOKEN!;
  const project = 'office';
  const repoId = '49b0c9f4-555f-4624-8157-a57e6df513b3';

  const fetcher = new PrFetcher(orgUrl, token);

  console.log('[1] Fetching PR #4318818 diff (with actual file content)...');
  const rawDiff = await fetcher.getPrDiff(repoId, 4318818, project);
  console.log(`    Raw diff length: ${rawDiff.length} chars`);
  
  // Show file paths
  const fileMatches = rawDiff.match(/^diff --git .+$/gm) || [];
  console.log(`\n    Files in diff: ${fileMatches.length}`);
  for (const m of fileMatches) {
    console.log(`       ${m}`);
  }

  // Parse and filter
  const uiFiles = parseAndFilterDiff(rawDiff);
  console.log(`\n    UI files after filter: ${uiFiles.length}`);
  for (const f of uiFiles) {
    console.log(`\n    === ${f.path} ===`);
    console.log(`    Additions (${f.additions.length} lines):`);
    console.log(f.additions.slice(0, 30).join('\n'));
    if (f.additions.length > 30) console.log(`    ... (${f.additions.length - 30} more lines)`);
  }
}

main().catch(e => console.error(e.message));
