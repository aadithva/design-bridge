import { FigmaNode } from './types.js';

/**
 * Recursively extract all text content from TEXT nodes in a Figma subtree.
 * Returns a deduplicated list of text strings (labels, headings, button texts, etc.).
 */
export function extractTextContent(node: FigmaNode): string[] {
  const texts: string[] = [];
  function walk(n: FigmaNode) {
    if (n.type === 'TEXT' && n.characters) {
      const text = n.characters.trim();
      if (text.length > 2) texts.push(text);
    }
    for (const child of n.children ?? []) walk(child);
  }
  walk(node);
  return [...new Set(texts)];
}
