import {
  FigmaNode,
  FigmaColor,
  DesignTokens,
  ColorToken,
  TypographyToken,
  SpacingToken,
  BorderRadiusToken,
  ComponentToken,
} from './types.js';

function figmaColorToHex(color: FigmaColor): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function figmaColorToRgba(color: FigmaColor) {
  return {
    r: Math.round(color.r * 255),
    g: Math.round(color.g * 255),
    b: Math.round(color.b * 255),
    a: color.a,
  };
}

/**
 * Recursively extract design tokens from a Figma node tree.
 */
export function extractDesignTokens(rootNode: FigmaNode): DesignTokens {
  const colors: ColorToken[] = [];
  const typography: TypographyToken[] = [];
  const spacing: SpacingToken[] = [];
  const borderRadius: BorderRadiusToken[] = [];
  const componentCounts = new Map<string, number>();

  function walk(node: FigmaNode, path: string) {
    const nodePath = path ? `${path} > ${node.name}` : node.name;

    // Extract colors from fills
    if (node.fills) {
      for (const fill of node.fills) {
        if (fill.type === 'SOLID' && fill.color && fill.visible !== false) {
          colors.push({
            hex: figmaColorToHex(fill.color),
            rgba: figmaColorToRgba(fill.color),
            source: nodePath,
            usage: 'fill',
          });
        }
      }
    }

    // Extract colors from strokes
    if (node.strokes) {
      for (const stroke of node.strokes) {
        if (stroke.type === 'SOLID' && stroke.color && stroke.visible !== false) {
          colors.push({
            hex: figmaColorToHex(stroke.color),
            rgba: figmaColorToRgba(stroke.color),
            source: nodePath,
            usage: 'stroke',
          });
        }
      }
    }

    // Extract typography from TEXT nodes
    if (node.type === 'TEXT' && node.style) {
      const s = node.style;
      if (s.fontFamily && s.fontSize) {
        typography.push({
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          fontWeight: s.fontWeight ?? 400,
          lineHeight: s.lineHeightPx,
          source: nodePath,
        });
      }
    }

    // Extract spacing from auto-layout frames
    if (node.layoutMode && node.layoutMode !== 'NONE') {
      if (node.itemSpacing != null) {
        spacing.push({ type: 'itemSpacing', value: node.itemSpacing, source: nodePath });
      }
      if (node.paddingLeft != null) {
        spacing.push({ type: 'paddingLeft', value: node.paddingLeft, source: nodePath });
      }
      if (node.paddingRight != null) {
        spacing.push({ type: 'paddingRight', value: node.paddingRight, source: nodePath });
      }
      if (node.paddingTop != null) {
        spacing.push({ type: 'paddingTop', value: node.paddingTop, source: nodePath });
      }
      if (node.paddingBottom != null) {
        spacing.push({ type: 'paddingBottom', value: node.paddingBottom, source: nodePath });
      }
    }

    // Extract border radius
    if (node.cornerRadius != null && node.cornerRadius > 0) {
      borderRadius.push({ value: node.cornerRadius, source: nodePath });
    }

    // Track component instances
    if (node.type === 'INSTANCE' && node.name) {
      const count = componentCounts.get(node.name) ?? 0;
      componentCounts.set(node.name, count + 1);
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        walk(child, nodePath);
      }
    }
  }

  walk(rootNode, '');

  const components: ComponentToken[] = Array.from(componentCounts.entries()).map(
    ([name, instanceCount]) => ({ name, instanceCount })
  );

  return { colors, typography, spacing, borderRadius, components };
}

/** Deduplicate color tokens by hex value, keeping the first occurrence */
export function deduplicateColors(colors: ColorToken[]): ColorToken[] {
  const seen = new Set<string>();
  return colors.filter((c) => {
    if (seen.has(c.hex)) return false;
    seen.add(c.hex);
    return true;
  });
}
