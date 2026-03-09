import pLimit from 'p-limit';
import { FigmaClient } from './figma-client.js';
import { FigmaNode, ExportedFrame } from './types.js';

const DEFAULT_MAX_FRAMES = 10;
const DOWNLOAD_CONCURRENCY = 3;

/**
 * Get top-level frames from a page node.
 * Limits to maxFrames to avoid excessive API calls.
 */
function getTopLevelFrames(pageNode: FigmaNode, maxFrames: number): FigmaNode[] {
  const frames =
    pageNode.children?.filter(
      (child) => child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'COMPONENT_SET'
    ) ?? [];

  return frames.slice(0, maxFrames);
}

/**
 * Export frames from a Figma page as PNG images.
 */
export async function exportFrames(
  client: FigmaClient,
  fileKey: string,
  pageNode: FigmaNode,
  maxFrames: number = DEFAULT_MAX_FRAMES,
  scale: number = 2
): Promise<ExportedFrame[]> {
  const frames = getTopLevelFrames(pageNode, maxFrames);

  if (frames.length === 0) {
    console.log('No top-level frames found on page');
    return [];
  }

  const nodeIds = frames.map((f) => f.id);
  console.log(`Exporting ${nodeIds.length} frames from "${pageNode.name}"...`);

  // Request image URLs from Figma
  const imageResponse = await client.exportImages(fileKey, nodeIds, scale, 'png');

  // Download images in parallel with concurrency limit
  const limit = pLimit(DOWNLOAD_CONCURRENCY);
  const results = await Promise.allSettled(
    frames.map((frame) =>
      limit(async (): Promise<ExportedFrame | null> => {
        const imageUrl = imageResponse.images[frame.id];
        if (!imageUrl) {
          console.warn(`No image URL returned for frame "${frame.name}" (${frame.id})`);
          return null;
        }

        const imageBuffer = await client.downloadImage(imageUrl);
        return {
          nodeId: frame.id,
          name: frame.name,
          imageUrl,
          imageBuffer,
          width: frame.absoluteBoundingBox?.width ?? 0,
          height: frame.absoluteBoundingBox?.height ?? 0,
        };
      })
    )
  );

  return results
    .filter(
      (r): r is PromiseFulfilledResult<ExportedFrame | null> => r.status === 'fulfilled'
    )
    .map((r) => r.value)
    .filter((v): v is ExportedFrame => v !== null);
}
