/**
 * Bidirectional Figma-to-Code completeness verification.
 * For each Figma scenario, finds the best code match; and vice versa.
 */
import {
  FigmaPageManifest,
  FigmaScenario,
  CompletenessReport,
  CoverageEntry,
  MissingEntry,
} from '../figma/types.js';

/** Normalize a name for comparison: lowercase, strip special chars, collapse spaces */
function normalize(name: string): string {
  return name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Compute a simple similarity score (0-1) between two normalized strings */
function fuzzyScore(a: string, b: string): number {
  if (a === b) return 1;
  const aWords = a.split(' ');
  const bWords = b.split(' ');
  const intersection = aWords.filter((w) => bWords.includes(w));
  if (intersection.length === 0) return 0;
  return (2 * intersection.length) / (aWords.length + bWords.length);
}

interface MatchResult {
  match: string;
  matchType: CoverageEntry['matchType'];
  confidence: number;
}

/** Multi-tier matching: exact → normalized → fuzzy → substring */
function findBestMatch(
  needle: string,
  candidates: string[],
): MatchResult | null {
  const needleNorm = normalize(needle);

  // Exact match
  for (const c of candidates) {
    if (c === needle) return { match: c, matchType: 'exact', confidence: 1.0 };
  }

  // Normalized match
  for (const c of candidates) {
    if (normalize(c) === needleNorm) return { match: c, matchType: 'normalized', confidence: 0.9 };
  }

  // Fuzzy match — pick the best above threshold
  let bestFuzzy: MatchResult | null = null;
  for (const c of candidates) {
    const score = fuzzyScore(needleNorm, normalize(c));
    if (score >= 0.5 && (!bestFuzzy || score > bestFuzzy.confidence)) {
      bestFuzzy = { match: c, matchType: 'fuzzy', confidence: score };
    }
  }
  if (bestFuzzy) return bestFuzzy;

  // Substring match
  for (const c of candidates) {
    const cNorm = normalize(c);
    if (needleNorm.includes(cNorm) || cNorm.includes(needleNorm)) {
      return { match: c, matchType: 'substring', confidence: 0.4 };
    }
  }

  return null;
}

/** Flatten all scenario component names from a manifest */
function flattenScenarioNames(scenarios: FigmaScenario[]): Array<{ name: string; nodeId: string }> {
  const result: Array<{ name: string; nodeId: string }> = [];
  function walk(s: FigmaScenario) {
    result.push({ name: s.componentName || s.name, nodeId: s.nodeId });
    for (const child of s.children) walk(child);
  }
  for (const s of scenarios) walk(s);
  return result;
}

/**
 * Check completeness of Figma scenarios vs code components.
 *
 * @param figmaManifest - The enumerated Figma page manifest
 * @param codeComponents - Component names extracted from code (e.g., function/class names)
 * @param codeFiles - File paths from the PR diff (used for path-based matching)
 */
export function checkCompleteness(
  figmaManifest: FigmaPageManifest,
  codeComponents: string[],
  codeFiles: string[],
): CompletenessReport {
  // Build the full set of code identifiers (component names + path-derived terms)
  const codeIdentifiers = [...new Set([...codeComponents, ...codeFiles.flatMap(derivFileTerms)])];

  const figmaItems = flattenScenarioNames(figmaManifest.scenarios);
  // Deduplicate by name
  const uniqueFigma = new Map<string, string>();
  for (const item of figmaItems) {
    if (!uniqueFigma.has(item.name)) {
      uniqueFigma.set(item.name, item.nodeId);
    }
  }

  const coveredScenarios: CoverageEntry[] = [];
  const missingFromCode: MissingEntry[] = [];

  // For each Figma scenario, find best match in code
  for (const [name, nodeId] of uniqueFigma) {
    const match = findBestMatch(name, codeIdentifiers);
    if (match) {
      coveredScenarios.push({
        figmaScenario: name,
        figmaNodeId: nodeId,
        codeMatch: match.match,
        matchType: match.matchType,
        confidence: match.confidence,
      });
    } else {
      missingFromCode.push({
        name,
        source: 'figma',
        details: `Figma scenario "${name}" has no matching code component`,
      });
    }
  }

  // For each code component, find best match in Figma
  const figmaNames = [...uniqueFigma.keys()];
  const missingFromFigma: MissingEntry[] = [];
  for (const codeName of codeComponents) {
    const match = findBestMatch(codeName, figmaNames);
    if (!match) {
      missingFromFigma.push({
        name: codeName,
        source: 'code',
        details: `Code component "${codeName}" has no matching Figma scenario`,
      });
    }
  }

  const totalFigma = uniqueFigma.size;
  const coveragePercentage = totalFigma > 0
    ? Math.round((coveredScenarios.length / totalFigma) * 100)
    : 100;

  return {
    coveredScenarios,
    missingFromCode,
    missingFromFigma,
    coveragePercentage,
  };
}

/** Derive search terms from a file path */
function derivFileTerms(filePath: string): string[] {
  const terms: string[] = [];
  const parts = filePath.split('/');
  for (const part of parts) {
    if (part.includes('.')) continue;
    const words = part.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_-]+/);
    for (const w of words) {
      if (w.length > 2) terms.push(w.toLowerCase());
    }
  }
  return terms;
}
