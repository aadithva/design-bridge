import { parseFigmaUrls } from '../pr-description-parser.js';

export interface FigmaFileEntry {
  fileKey: string;
  name: string;
  projectName: string;
  projectId: number;
  figmaUrl: string;
  thumbnailUrl: string;
  lastModified: string;
}

export interface FigmaMatchResult {
  figmaFileKey: string;
  figmaFileName: string;
  figmaUrl: string;
  matchedComponent: string;
  score: number;
}

/** Normalize a name for comparison: lowercase, split camelCase, strip special chars */
export function normalize(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compute word-overlap similarity (0-1) between two normalized strings */
export function fuzzyScore(a: string, b: string): number {
  if (a === b) return 1;
  const aWords = a.split(' ').filter(w => w.length > 2);
  const bWords = b.split(' ').filter(w => w.length > 2);
  if (aWords.length === 0 || bWords.length === 0) return 0;
  const intersection = aWords.filter(w => bWords.includes(w));
  if (intersection.length === 0) return 0;
  return (2 * intersection.length) / (aWords.length + bWords.length);
}

const BRANCH_NOISE_WORDS = new Set([
  'users', 'user', 'feature', 'fix', 'dev', 'bug', 'hotfix', 'release',
  'refs', 'heads', 'main', 'master', 'develop', 'staging', 'prod',
]);

/** Extract meaningful keywords from a branch name like refs/heads/users/john/chatinput-redesign */
function extractBranchKeywords(sourceRefName: string): string {
  return sourceRefName
    .replace(/^refs\/heads\//, '')
    .split(/[\/\-_]/)
    .filter(w => w.length > 2 && !BRANCH_NOISE_WORDS.has(w.toLowerCase()))
    .join(' ')
    .toLowerCase();
}

/** Extract readable text from a PR description, stripping URLs, markdown, and HTML */
function extractDescriptionText(description: string): string {
  if (!description) return '';
  return description
    .replace(/https?:\/\/[^\s)]+/g, '')           // strip URLs
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')       // markdown links → text
    .replace(/<[^>]+>/g, '')                        // HTML tags
    .replace(/[^a-zA-Z0-9\s]/g, ' ')               // special chars
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Match a craft PR's component names against a list of Figma files.
 * Returns all matches above the score threshold (default 0.3).
 */
export function matchPRToFigmaFiles(
  componentNames: string[],
  figmaFiles: FigmaFileEntry[],
  threshold = 0.3
): FigmaMatchResult[] {
  const results: FigmaMatchResult[] = [];
  const seen = new Set<string>();

  for (const component of componentNames) {
    const normComponent = normalize(component);
    if (!normComponent || normComponent.length < 3) continue;

    for (const file of figmaFiles) {
      const normFileName = normalize(file.name);
      const score = fuzzyScore(normComponent, normFileName);

      if (score >= threshold) {
        const key = `${file.fileKey}:${component}`;
        if (seen.has(key)) continue;
        seen.add(key);

        results.push({
          figmaFileKey: file.fileKey,
          figmaFileName: file.name,
          figmaUrl: file.figmaUrl,
          matchedComponent: component,
          score,
        });
      }
    }
  }

  // Sort by score descending, deduplicate by file key (keep best score per file)
  results.sort((a, b) => b.score - a.score);

  const bestPerFile = new Map<string, FigmaMatchResult>();
  for (const r of results) {
    if (!bestPerFile.has(r.figmaFileKey) || bestPerFile.get(r.figmaFileKey)!.score < r.score) {
      bestPerFile.set(r.figmaFileKey, r);
    }
  }

  return [...bestPerFile.values()].sort((a, b) => b.score - a.score);
}

export type MatchReason = 'figma_url' | 'repo_folder' | 'commit_message' | 'component_path' | 'pr_title' | 'branch_name' | 'description_text';

export interface PRMatchResult {
  pullRequestId: number;
  title: string;
  createdBy: string;
  creationDate: string;
  repositoryName: string;
  project: string;
  repositoryId: string;
  sourceRefName: string;
  matchedComponent: string;
  score: number;
  uiFiles: string[];
  matchReason: MatchReason;
}

/** Noise folder names to skip when extracting folder segments */
const FOLDER_NOISE = new Set([
  'src', 'lib', 'components', 'packages', 'node_modules', 'dist', 'build',
  'test', 'tests', '__tests__', '__mocks__', 'utils', 'helpers', 'common',
  'shared', 'core', 'types', 'interfaces', 'models', 'assets', 'styles',
  'hooks', 'contexts', 'providers', 'config', 'scripts', 'tools',
]);

/**
 * Extract meaningful folder names from a file path.
 * For `/packages/copilot-chat/src/components/ChatInput/ChatInput.tsx`:
 *   segments: ['copilot-chat', 'ChatInput']
 *   compound: 'copilot-chat/ChatInput'
 */
function extractFolderNames(filePath: string): { segments: string[]; compound: string } {
  const parts = filePath.replace(/^\//, '').split('/');
  // Remove the filename (last segment)
  parts.pop();
  const meaningful = parts.filter(p => p.length > 2 && !FOLDER_NOISE.has(p.toLowerCase()));
  const compound = meaningful.join('/');
  return { segments: meaningful, compound };
}

export interface RepoFolderMatch {
  folder: string;
  score: number;
  prIds: number[];
}

/**
 * Search cached PR uiFiles for repo folders matching a Figma file name.
 * Returns matched folders sorted by score, with the PR IDs that touch each folder.
 */
export function searchRepoFolders(
  figmaFileName: string,
  craftPRs: Array<{ pullRequestId: number; uiFiles: string[] }>,
  threshold = 0.4,
): RepoFolderMatch[] {
  const normFileName = normalize(figmaFileName);
  if (!normFileName || normFileName.length < 3) return [];

  // Build folder → Set<prId> mapping
  const folderToPRs = new Map<string, Set<number>>();
  for (const pr of craftPRs) {
    for (const file of pr.uiFiles) {
      const { segments, compound } = extractFolderNames(file);
      // Add individual segments
      for (const seg of segments) {
        if (!folderToPRs.has(seg)) folderToPRs.set(seg, new Set());
        folderToPRs.get(seg)!.add(pr.pullRequestId);
      }
      // Add compound path (e.g. "copilot-chat/ChatInput")
      if (compound && segments.length > 1) {
        if (!folderToPRs.has(compound)) folderToPRs.set(compound, new Set());
        folderToPRs.get(compound)!.add(pr.pullRequestId);
      }
    }
  }

  // Fuzzy-match each folder name against the Figma file name
  const results: RepoFolderMatch[] = [];
  for (const [folder, prIdSet] of folderToPRs) {
    const normFolder = normalize(folder);
    if (!normFolder || normFolder.length < 3) continue;
    const score = fuzzyScore(normFileName, normFolder);
    if (score >= threshold) {
      results.push({ folder, score, prIds: [...prIdSet] });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Match a Figma file name against a list of craft PRs using multi-signal scoring.
 * Signals: Figma URL (short-circuit), repo folder match, component paths, PR title, branch name, description text.
 * Returns all PRs whose combined score is above the threshold.
 */
export function matchFigmaFileToPRs(
  figmaFileName: string,
  craftPRs: Array<{
    pullRequestId: number;
    title: string;
    description: string;
    createdBy: string;
    creationDate: string;
    repositoryName: string;
    project: string;
    repositoryId: string;
    sourceRefName: string;
    componentNames: string[];
    uiFiles: string[];
  }>,
  options?: { figmaFileKey?: string; threshold?: number; commitMatchedPRIds?: Set<number> }
): PRMatchResult[] {
  const threshold = options?.threshold ?? 0.3;
  const figmaFileKey = options?.figmaFileKey;
  const normFileName = normalize(figmaFileName);
  if (!normFileName || normFileName.length < 3) return [];

  const results: PRMatchResult[] = [];
  const seen = new Set<number>();

  for (const pr of craftPRs) {
    // Signal 1: Figma URL match (short-circuit for 100% confidence)
    if (figmaFileKey && pr.description) {
      const figmaUrls = parseFigmaUrls(pr.description);
      if (figmaUrls.some(u => u.fileKey === figmaFileKey)) {
        if (!seen.has(pr.pullRequestId)) {
          seen.add(pr.pullRequestId);
          results.push({
            pullRequestId: pr.pullRequestId,
            title: pr.title,
            createdBy: pr.createdBy,
            creationDate: pr.creationDate,
            repositoryName: pr.repositoryName,
            project: pr.project,
            repositoryId: pr.repositoryId,
            sourceRefName: pr.sourceRefName,
            matchedComponent: `Figma URL (${figmaFileKey})`,
            score: 1.0,
            uiFiles: pr.uiFiles,
            matchReason: 'figma_url',
          });
        }
        continue; // skip fuzzy scoring for this PR
      }
    }

    // Signal 2: Repo folder match — match Figma file name against folder names in uiFiles
    let folderScore = 0;
    let bestFolder = '';
    for (const file of pr.uiFiles) {
      const { segments, compound } = extractFolderNames(file);
      // Check compound path first (higher quality match)
      if (compound && segments.length > 1) {
        const normCompound = normalize(compound);
        const score = fuzzyScore(normFileName, normCompound);
        if (score > folderScore) {
          folderScore = score;
          bestFolder = compound;
        }
      }
      // Check individual segments
      for (const seg of segments) {
        const normSeg = normalize(seg);
        if (!normSeg || normSeg.length < 3) continue;
        const score = fuzzyScore(normFileName, normSeg);
        if (score > folderScore) {
          folderScore = score;
          bestFolder = seg;
        }
      }
    }

    // Signal 3: Component path score
    let componentScore = 0;
    let bestComponent = '';
    for (const component of pr.componentNames) {
      const normComponent = normalize(component);
      const score = fuzzyScore(normFileName, normComponent);
      if (score > componentScore) {
        componentScore = score;
        bestComponent = component;
      }
    }

    // Signal 4: PR title score
    const titleScore = fuzzyScore(normFileName, normalize(pr.title));

    // Signal 5: Branch name score
    const branchKeywords = extractBranchKeywords(pr.sourceRefName);
    const branchScore = branchKeywords ? fuzzyScore(normFileName, branchKeywords) : 0;

    // Signal 6: Description text score
    const descText = extractDescriptionText(pr.description || '');
    const descScore = descText ? fuzzyScore(normFileName, descText) : 0;

    // Signal 7: Commit message match (pre-computed via ADO Search API)
    const commitScore = options?.commitMatchedPRIds?.has(pr.pullRequestId) ? 1.0 : 0;

    // Weighted average (folder match is the strongest signal)
    const weightedAvg =
      folderScore * 0.40 +
      commitScore * 0.20 +
      componentScore * 0.15 +
      titleScore * 0.10 +
      branchScore * 0.08 +
      descScore * 0.07;

    // Find best individual signal (prevent good single matches from being diluted)
    const signals: Array<{ score: number; reason: MatchReason; component: string }> = [
      { score: folderScore, reason: 'repo_folder', component: bestFolder },
      { score: commitScore, reason: 'commit_message', component: 'commit search' },
      { score: componentScore, reason: 'component_path', component: bestComponent },
      { score: titleScore, reason: 'pr_title', component: pr.title },
      { score: branchScore, reason: 'branch_name', component: pr.sourceRefName },
      { score: descScore, reason: 'description_text', component: 'description' },
    ];
    const bestSignal = signals.reduce((a, b) => (b.score > a.score ? b : a));

    const combinedScore = Math.max(weightedAvg, bestSignal.score * 0.7);
    const matchReason = bestSignal.reason;
    const matchedComponent = bestSignal.reason === 'pr_title' ? pr.title : bestSignal.component || bestComponent;

    if (combinedScore >= threshold && !seen.has(pr.pullRequestId)) {
      seen.add(pr.pullRequestId);
      results.push({
        pullRequestId: pr.pullRequestId,
        title: pr.title,
        createdBy: pr.createdBy,
        creationDate: pr.creationDate,
        repositoryName: pr.repositoryName,
        project: pr.project,
        repositoryId: pr.repositoryId,
        sourceRefName: pr.sourceRefName,
        matchedComponent,
        score: combinedScore,
        uiFiles: pr.uiFiles,
        matchReason,
      });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
