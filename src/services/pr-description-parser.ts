export interface FigmaUrlInfo {
  fileKey: string;
  nodeId?: string;
  rawUrl: string;
}

/**
 * Extract Figma URLs from a PR description.
 * Supports figma.com/file/ and figma.com/design/ URL patterns.
 */
export function parseFigmaUrls(description: string): FigmaUrlInfo[] {
  if (!description) return [];

  // Match both /file/ and /design/ URL patterns
  const urlPattern = /https?:\/\/(?:www\.)?figma\.com\/(?:file|design)\/([a-zA-Z0-9]+)(?:\/[^\s?#)]*)?(?:\?[^\s)#]*)?/g;

  const results: FigmaUrlInfo[] = [];
  const seenKeys = new Set<string>();

  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(description)) !== null) {
    const rawUrl = match[0];
    const fileKey = match[1];

    if (seenKeys.has(fileKey)) continue;
    seenKeys.add(fileKey);

    // Extract node-id query param if present
    let nodeId: string | undefined;
    const nodeIdMatch = rawUrl.match(/[?&]node-id=([^&#\s]+)/);
    if (nodeIdMatch) {
      // Figma encodes node IDs as "X-Y" in URLs but uses "X:Y" in the API
      nodeId = decodeURIComponent(nodeIdMatch[1]).replace('-', ':');
    }

    results.push({ fileKey, nodeId, rawUrl });
  }

  return results;
}
