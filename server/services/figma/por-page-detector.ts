import { FigmaNode, PorPageResult, RelevantPagesResult } from './types.js';

interface ScoringRule {
  pattern: RegExp;
  score: number;
  signal: string;
}

const HIGH_CONFIDENCE: ScoringRule[] = [
  { pattern: /\bpor\b/i, score: 10, signal: 'name contains "POR"' },
  { pattern: /\bfinal\b/i, score: 10, signal: 'name contains "final"' },
  { pattern: /\bhandoff\b/i, score: 10, signal: 'name contains "handoff"' },
  { pattern: /\bdev[\s-]?ready\b/i, score: 10, signal: 'name contains "dev ready"' },
  { pattern: /\bspec\b/i, score: 10, signal: 'name contains "spec"' },
  { pattern: /\bredlines?\b/i, score: 10, signal: 'name contains "redlines"' },
  { pattern: /\bcrawl\b/i, score: 10, signal: 'name contains "CRAWL"' },
];

const MEDIUM_CONFIDENCE: ScoringRule[] = [
  { pattern: /v\d+(\.\d+)?/i, score: 5, signal: 'name contains version number' },
  { pattern: /\brelease\b/i, score: 5, signal: 'name contains "release"' },
  { pattern: /\bproduction\b/i, score: 5, signal: 'name contains "production"' },
  { pattern: /\bapproved\b/i, score: 5, signal: 'name contains "approved"' },
];

const NEGATIVE: ScoringRule[] = [
  { pattern: /\bwip\b/i, score: -5, signal: 'name contains "WIP"' },
  { pattern: /\bdraft\b/i, score: -5, signal: 'name contains "draft"' },
  { pattern: /\barchive[ds]?\b/i, score: -5, signal: 'name contains "archive"' },
  { pattern: /\bdeprecated\b/i, score: -5, signal: 'name contains "deprecated"' },
  { pattern: /\bexplor(ation|e)\b/i, score: -5, signal: 'name contains "exploration"' },
  { pattern: /\bold\b/i, score: -3, signal: 'name contains "old"' },
];

const ALL_RULES = [...HIGH_CONFIDENCE, ...MEDIUM_CONFIDENCE, ...NEGATIVE];

function scorePage(pageName: string): { score: number; signals: string[] } {
  let score = 0;
  const signals: string[] = [];

  for (const rule of ALL_RULES) {
    if (rule.pattern.test(pageName)) {
      score += rule.score;
      signals.push(rule.signal);
    }
  }

  return { score, signals };
}

/**
 * Detect the POR (Plan of Record) page from a Figma document.
 * If a specific nodeId is provided, it overrides heuristic detection.
 */
export function detectPorPage(
  document: FigmaNode,
  overrideNodeId?: string
): PorPageResult | null {
  const pages = document.children?.filter((c) => c.type === 'CANVAS') ?? [];

  if (pages.length === 0) return null;

  // If a specific node ID is provided, use that page directly
  if (overrideNodeId) {
    const targetPage = pages.find((p) => p.id === overrideNodeId);
    if (targetPage) {
      return {
        pageId: targetPage.id,
        pageName: targetPage.name,
        confidence: 100,
        signals: ['node-id override from URL'],
      };
    }
  }

  // Score each page and pick the highest
  const scored = pages.map((page) => {
    const { score, signals } = scorePage(page.name);
    return {
      pageId: page.id,
      pageName: page.name,
      confidence: score,
      signals,
    };
  });

  scored.sort((a, b) => b.confidence - a.confidence);

  // If best score is <= 0, fall back to the first page
  if (scored[0].confidence <= 0) {
    return {
      pageId: pages[0].id,
      pageName: pages[0].name,
      confidence: 0,
      signals: ['fallback to first page (no strong POR signals)'],
    };
  }

  return scored[0];
}

/**
 * Detect both POR and Redlines pages from a Figma document.
 * Returns them separately so the caller can choose which to use.
 */
export function detectRelevantPages(document: FigmaNode): RelevantPagesResult {
  const pages = document.children?.filter((c) => c.type === 'CANVAS') ?? [];

  const scored = pages.map((page) => {
    const { score, signals } = scorePage(page.name);
    return {
      pageId: page.id,
      pageName: page.name,
      confidence: score,
      signals,
    };
  });

  scored.sort((a, b) => b.confidence - a.confidence);

  const redlinesPage = scored.find((p) => /\bredlines?\b/i.test(p.pageName)) ?? null;
  const porPage = scored.find((p) =>
    p !== redlinesPage && p.confidence > 0
  ) ?? (scored.length > 0 && scored[0] !== redlinesPage ? scored[0] : null);

  return { porPage, redlinesPage, allScoredPages: scored };
}
