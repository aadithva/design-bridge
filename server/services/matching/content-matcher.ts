/**
 * Deep content matcher: compares Figma page content (component names + text)
 * against PR component names to produce a content overlap score.
 */
import { normalize, fuzzyScore } from './craft-figma-matcher.js';

export interface ContentMatchResult {
  prId: number;
  contentScore: number;
  sharedComponents: Array<{ figmaName: string; codeName: string; similarity: number }>;
  sharedTexts: Array<{ figmaText: string; codeName: string; similarity: number }>;
  figmaPageName: string;
  figmaComponentCount: number;
  codeComponentCount: number;
}

interface FigmaContent {
  componentNames: string[];
  texts: string[];
  pageName: string;
}

interface CandidatePR {
  prId: number;
  componentNames: string[];
}

const COMPONENT_MATCH_THRESHOLD = 0.4;
const TEXT_MATCH_THRESHOLD = 0.5;

/**
 * Compute component name overlap score between Figma and code component names.
 * Returns Dice coefficient over fuzzy-matched pairs.
 */
function computeComponentOverlap(
  figmaNames: string[],
  codeNames: string[],
): { score: number; sharedComponents: Array<{ figmaName: string; codeName: string; similarity: number }> } {
  if (figmaNames.length === 0 || codeNames.length === 0) {
    return { score: 0, sharedComponents: [] };
  }

  const normFigma = figmaNames.map(n => ({ original: n, normalized: normalize(n) }));
  const normCode = codeNames.map(n => ({ original: n, normalized: normalize(n) }));

  const sharedComponents: Array<{ figmaName: string; codeName: string; similarity: number }> = [];
  const matchedFigma = new Set<number>();
  const matchedCode = new Set<number>();

  // For each Figma component, find the best matching code component
  for (let fi = 0; fi < normFigma.length; fi++) {
    let bestScore = 0;
    let bestCodeIdx = -1;

    for (let ci = 0; ci < normCode.length; ci++) {
      if (matchedCode.has(ci)) continue;
      const score = fuzzyScore(normFigma[fi].normalized, normCode[ci].normalized);
      if (score > bestScore) {
        bestScore = score;
        bestCodeIdx = ci;
      }
    }

    if (bestScore >= COMPONENT_MATCH_THRESHOLD && bestCodeIdx >= 0) {
      matchedFigma.add(fi);
      matchedCode.add(bestCodeIdx);
      sharedComponents.push({
        figmaName: normFigma[fi].original,
        codeName: normCode[bestCodeIdx].original,
        similarity: Math.round(bestScore * 100) / 100,
      });
    }
  }

  // Dice coefficient: 2 * matched / (total figma + total code)
  const score = sharedComponents.length > 0
    ? (2 * sharedComponents.length) / (figmaNames.length + codeNames.length)
    : 0;

  return { score, sharedComponents };
}

/**
 * Compute text content overlap: fuzzy-match Figma text strings against PR component names.
 * Catches cases like Figma text "Send message" matching code component "SendMessage".
 */
function computeTextOverlap(
  figmaTexts: string[],
  codeNames: string[],
): { score: number; sharedTexts: Array<{ figmaText: string; codeName: string; similarity: number }> } {
  if (figmaTexts.length === 0 || codeNames.length === 0) {
    return { score: 0, sharedTexts: [] };
  }

  const normCode = codeNames.map(n => ({ original: n, normalized: normalize(n) }));
  const sharedTexts: Array<{ figmaText: string; codeName: string; similarity: number }> = [];

  for (const text of figmaTexts) {
    const normText = normalize(text);
    if (!normText || normText.length < 3) continue;

    let bestScore = 0;
    let bestCode: { original: string; normalized: string } | null = null;

    for (const code of normCode) {
      const score = fuzzyScore(normText, code.normalized);
      if (score > bestScore) {
        bestScore = score;
        bestCode = code;
      }
    }

    if (bestScore >= TEXT_MATCH_THRESHOLD && bestCode) {
      sharedTexts.push({
        figmaText: text,
        codeName: bestCode.original,
        similarity: Math.round(bestScore * 100) / 100,
      });
    }
  }

  // Normalize score: ratio of matched texts to total figma texts (capped at 1)
  const score = Math.min(1, sharedTexts.length / Math.max(figmaTexts.length, 1));

  return { score, sharedTexts };
}

/**
 * Deep-match a Figma file's content against candidate PRs.
 * Compares component names and text content from the Figma POR page
 * against each PR's component names derived from file paths.
 */
export function deepMatchFigmaFileToPRs(
  figmaContent: FigmaContent,
  candidatePRs: CandidatePR[],
): ContentMatchResult[] {
  const results: ContentMatchResult[] = [];

  for (const pr of candidatePRs) {
    const { score: componentOverlap, sharedComponents } = computeComponentOverlap(
      figmaContent.componentNames,
      pr.componentNames,
    );

    const { score: textOverlap, sharedTexts } = computeTextOverlap(
      figmaContent.texts,
      pr.componentNames,
    );

    const contentScore = componentOverlap * 0.7 + textOverlap * 0.3;

    // Only include if there's any meaningful overlap
    if (contentScore > 0 || sharedComponents.length > 0 || sharedTexts.length > 0) {
      results.push({
        prId: pr.prId,
        contentScore: Math.round(contentScore * 100) / 100,
        sharedComponents,
        sharedTexts,
        figmaPageName: figmaContent.pageName,
        figmaComponentCount: figmaContent.componentNames.length,
        codeComponentCount: pr.componentNames.length,
      });
    }
  }

  return results.sort((a, b) => b.contentScore - a.contentScore);
}
