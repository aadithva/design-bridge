/**
 * Walks a Figma page tree and catalogs every scenario/component
 * into a structured manifest for completeness checking.
 */
import { FigmaNode, FigmaScenario, FigmaPageManifest, VariantGroup } from './types.js';

const ENUMERABLE_TYPES = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET']);

/**
 * Parse variant properties from a Figma variant name.
 * e.g. "State=Hover, Size=Large" → { State: "Hover", Size: "Large" }
 */
function parseVariantName(name: string): Record<string, string> {
  const props: Record<string, string> = {};
  const parts = name.split(',').map((s) => s.trim());
  for (const part of parts) {
    const eqIdx = part.indexOf('=');
    if (eqIdx > 0) {
      props[part.slice(0, eqIdx).trim()] = part.slice(eqIdx + 1).trim();
    }
  }
  return props;
}

/**
 * Derive a normalized component name from a node name.
 * "InlineCitation / Header / State=Default" → "inline citation header"
 */
function deriveComponentName(name: string): string {
  // Strip variant properties (everything after the last =)
  const base = name.replace(/,\s*\w+\s*=\s*\w+/g, '').replace(/\w+\s*=\s*\w+/g, '').trim();
  // Split on slashes, camelCase, underscores, hyphens
  return base
    .split(/[\s/]+/)
    .map((s) => s.replace(/([a-z])([A-Z])/g, '$1 $2'))
    .join(' ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function walkNode(
  node: FigmaNode,
  path: string,
  depth: number,
  maxDepth: number,
  variantGroups: VariantGroup[],
): FigmaScenario | null {
  if (depth > maxDepth) return null;
  if (!ENUMERABLE_TYPES.has(node.type)) return null;

  const currentPath = path ? `${path} > ${node.name}` : node.name;

  // Handle COMPONENT_SET — collect all variant children
  if (node.type === 'COMPONENT_SET' && node.children) {
    const variants = node.children
      .filter((c) => c.type === 'COMPONENT')
      .map((c) => ({
        name: c.name,
        nodeId: c.id,
        properties: parseVariantName(c.name),
      }));

    if (variants.length > 0) {
      variantGroups.push({
        componentSetName: node.name,
        nodeId: node.id,
        variants,
      });
    }

    const children: FigmaScenario[] = variants.map((v) => ({
      name: v.name,
      type: 'COMPONENT' as const,
      nodeId: v.nodeId,
      path: `${currentPath} > ${v.name}`,
      componentName: deriveComponentName(node.name),
      variantProperties: v.properties,
      children: [],
    }));

    return {
      name: node.name,
      type: node.type,
      nodeId: node.id,
      path: currentPath,
      boundingBox: node.absoluteBoundingBox,
      componentName: deriveComponentName(node.name),
      children,
    };
  }

  // For FRAME and COMPONENT, recurse into children
  const children: FigmaScenario[] = [];
  if (node.children && depth < maxDepth) {
    for (const child of node.children) {
      const childScenario = walkNode(child, currentPath, depth + 1, maxDepth, variantGroups);
      if (childScenario) {
        children.push(childScenario);
      }
    }
  }

  return {
    name: node.name,
    type: node.type,
    nodeId: node.id,
    path: currentPath,
    boundingBox: node.absoluteBoundingBox,
    componentName: deriveComponentName(node.name),
    children,
  };
}

/**
 * Enumerate all scenarios/components on a Figma page.
 * Returns a structured manifest of every top-level frame, component, and variant group.
 */
export function enumeratePageScenarios(
  pageNode: FigmaNode,
  maxDepth = 3,
): FigmaPageManifest {
  const variantGroups: VariantGroup[] = [];
  const scenarios: FigmaScenario[] = [];

  const topLevelChildren = pageNode.children ?? [];
  for (const child of topLevelChildren) {
    const scenario = walkNode(child, '', 0, maxDepth, variantGroups);
    if (scenario) {
      scenarios.push(scenario);
    }
  }

  // Collect all component names (deduplicated)
  const nameSet = new Set<string>();
  function collectNames(s: FigmaScenario) {
    if (s.componentName) nameSet.add(s.componentName);
    for (const child of s.children) collectNames(child);
  }
  for (const s of scenarios) collectNames(s);

  // Count total scenarios (including nested)
  function countAll(s: FigmaScenario): number {
    return 1 + s.children.reduce((sum, c) => sum + countAll(c), 0);
  }
  const totalCount = scenarios.reduce((sum, s) => sum + countAll(s), 0);

  return {
    pageId: pageNode.id,
    pageName: pageNode.name,
    scenarios,
    totalCount,
    componentNames: [...nameSet].sort(),
    variantGroups,
  };
}
