import parseDiff, { File, Change } from 'parse-diff';

/** File extensions considered UI-relevant */
const UI_EXTENSIONS = new Set([
  '.tsx',
  '.jsx',
  '.css',
  '.scss',
  '.less',
  '.styles.ts',
  '.styles.js',
  '.theme.ts',
  '.theme.js',
  '.tokens.ts',
  '.tokens.js',
]);

/** Path segments that indicate UI-relevant files */
const UI_PATH_SEGMENTS = [
  '/components/',
  '/styles/',
  '/theme/',
  '/ui/',
  '/views/',
  '/pages/',
  '/layouts/',
];

export interface ParsedDiffFile {
  path: string;
  additions: string[];
  deletions: string[];
}

/**
 * Check if a file path is UI-relevant based on extension and path.
 */
function isUiRelevant(filePath: string): boolean {
  const lower = filePath.toLowerCase();

  // Check extensions
  for (const ext of UI_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }

  // Check path segments
  for (const segment of UI_PATH_SEGMENTS) {
    if (lower.includes(segment)) return true;
  }

  return false;
}

/**
 * Parse a unified diff string and filter to UI-relevant files.
 * Returns only the added lines (new code being introduced).
 */
export function parseAndFilterDiff(diffText: string): ParsedDiffFile[] {
  if (!diffText) return [];

  const files = parseDiff(diffText);
  const results: ParsedDiffFile[] = [];

  for (const file of files) {
    const filePath = file.to ?? file.from ?? '';
    if (!filePath || filePath === '/dev/null') continue;
    if (!isUiRelevant(filePath)) continue;

    const additions: string[] = [];
    const deletions: string[] = [];

    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type === 'add') {
          additions.push(change.content);
        } else if (change.type === 'del') {
          deletions.push(change.content);
        }
      }
    }

    if (additions.length > 0 || deletions.length > 0) {
      results.push({ path: filePath, additions, deletions });
    }
  }

  return results;
}

/**
 * Get a summary of the diff for reporting.
 */
export function getDiffSummary(files: ParsedDiffFile[]): {
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  filePaths: string[];
} {
  return {
    totalFiles: files.length,
    totalAdditions: files.reduce((sum, f) => sum + f.additions.length, 0),
    totalDeletions: files.reduce((sum, f) => sum + f.deletions.length, 0),
    filePaths: files.map((f) => f.path),
  };
}
