/**
 * Component-level Figma-to-Code comparison engine.
 * Finds Figma components matching code changes, extracts per-component
 * tokens, and does property-by-property comparison.
 */
import { FigmaClient } from '../figma/figma-client.js';
import type { FigmaPageManifest, FigmaScenario, VariantGroup } from '../figma/types.js';

export interface FigmaComponentSpec {
  nodeId: string;
  name: string;
  type: string;
  fills: Array<{ hex: string; opacity?: number }>;
  padding: { top: number; right: number; bottom: number; left: number };
  gap: number;
  borderRadius: number;
  layout: string;
  align: string;
  justify: string;
  size: { width: number; height: number };
  font?: { family: string; size: number; weight: number; lineHeight?: number };
  children: FigmaComponentSpec[];
}

export interface ComparisonFinding {
  property: string;
  figmaValue: string;
  codeValue: string;
  severity: 'error' | 'warning' | 'info' | 'pass';
  component: string;
  message: string;
}

export interface ComponentComparison {
  componentName: string;
  figmaNodeId: string;
  figmaPath: string;
  findings: ComparisonFinding[];
  overallStatus: 'error' | 'warning' | 'info' | 'pass';
  componentType?: 'COMPONENT_SET' | 'COMPONENT' | 'FRAME';
  sectionName?: string;
  variantCount?: number;
  variantsCovered?: number;
  variantDetails?: Array<{
    name: string;
    properties: Record<string, string>;
    covered: boolean;
  }>;
}

export interface ReviewResult {
  prTitle: string;
  prId: number;
  figmaUrl: string;
  figmaPageName: string;
  components: ComponentComparison[];
  codeFile: string;
  summary: { errors: number; warnings: number; info: number; passes: number };
}

function rgbaToHex(color: { r: number; g: number; b: number }): string {
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('');
}

export function extractComponentSpec(node: any, depth = 0): FigmaComponentSpec {
  const fills = (node.fills || [])
    .filter((f: any) => f.visible !== false && f.type === 'SOLID' && f.color)
    .map((f: any) => ({ hex: rgbaToHex(f.color), opacity: f.opacity }));

  const spec: FigmaComponentSpec = {
    nodeId: node.id,
    name: node.name || '',
    type: node.type || '',
    fills,
    padding: {
      top: node.paddingTop ?? 0,
      right: node.paddingRight ?? 0,
      bottom: node.paddingBottom ?? 0,
      left: node.paddingLeft ?? 0,
    },
    gap: node.itemSpacing ?? 0,
    borderRadius: node.cornerRadius ?? 0,
    layout: node.layoutMode || 'NONE',
    align: node.counterAxisAlignItems || '',
    justify: node.primaryAxisAlignItems || '',
    size: {
      width: Math.round(node.absoluteBoundingBox?.width ?? 0),
      height: Math.round(node.absoluteBoundingBox?.height ?? 0),
    },
    children: [],
  };

  if (node.style) {
    spec.font = {
      family: node.style.fontFamily || '',
      size: node.style.fontSize || 0,
      weight: node.style.fontWeight || 400,
      lineHeight: node.style.lineHeightPx ? Math.round(node.style.lineHeightPx) : undefined,
    };
  }

  if (node.children && depth < 6) {
    spec.children = node.children.map((child: any) => extractComponentSpec(child, depth + 1));
  }

  return spec;
}

export function findMatchingComponents(
  node: any,
  searchTerms: string[],
  path = '',
  depth = 0,
): Array<{ node: any; path: string; matchedTerm: string }> {
  const name = (node.name || '').toLowerCase();
  const currentPath = path ? `${path} > ${node.name}` : node.name;
  const results: Array<{ node: any; path: string; matchedTerm: string }> = [];

  for (const term of searchTerms) {
    if (name.includes(term.toLowerCase())) {
      results.push({ node, path: currentPath, matchedTerm: term });
      break;
    }
  }

  if (node.children && depth < 10) {
    for (const child of node.children) {
      results.push(...findMatchingComponents(child, searchTerms, currentPath, depth + 1));
    }
  }
  return results;
}

export function parseCodeStyles(code: string): Map<string, string> {
  const styles = new Map<string, string>();

  const propRegex = /(\w+(?:[A-Z]\w*)*)\s*:\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`|tokens\.(\w+)|(\d+(?:\.\d+)?(?:px|rem|em|%)?)|(\w+))/g;
  let match;
  while ((match = propRegex.exec(code)) !== null) {
    const prop = match[1];
    const value = match[2] || match[3] || match[4] || (match[5] ? `tokens.${match[5]}` : null) || match[6] || match[7];
    if (value && prop) styles.set(prop, value);
  }

  const shorthandRegex = /shorthands\.(padding|margin|border)\(([^)]+)\)/g;
  while ((match = shorthandRegex.exec(code)) !== null) {
    const prop = match[1];
    const args = match[2].replace(/["']/g, '').split(',').map(s => s.trim());
    styles.set(`${prop}Shorthand`, args.join(' '));
  }

  return styles;
}

export function compareComponent(
  componentName: string,
  figmaSpec: FigmaComponentSpec,
  codeStyles: Map<string, string>,
): ComparisonFinding[] {
  const findings: ComparisonFinding[] = [];
  const add = (property: string, figmaVal: string, codeVal: string, severity: ComparisonFinding['severity'], message: string) => {
    findings.push({ property, figmaValue: figmaVal, codeValue: codeVal, severity, component: componentName, message });
  };

  // Border radius
  const codeBR = codeStyles.get('borderRadius');
  if (codeBR && figmaSpec.borderRadius) {
    const codeNum = parseInt(codeBR);
    if (!isNaN(codeNum)) {
      const figmaIsFullRound = figmaSpec.borderRadius >= 9999;
      if (figmaIsFullRound && codeNum < 100) {
        add('borderRadius', `${figmaSpec.borderRadius} (fully rounded)`, codeBR, 'error',
          `Figma uses fully rounded pill shape, code uses ${codeBR}`);
      } else if (codeNum !== figmaSpec.borderRadius && !figmaIsFullRound) {
        add('borderRadius', `${figmaSpec.borderRadius}px`, codeBR, Math.abs(codeNum - figmaSpec.borderRadius) > 4 ? 'warning' : 'info', `Differs by ${Math.abs(codeNum - figmaSpec.borderRadius)}px`);
      } else if (codeNum === figmaSpec.borderRadius || (figmaIsFullRound && codeNum >= 100)) {
        add('borderRadius', `${figmaSpec.borderRadius}px`, codeBR, 'pass', 'Matches');
      }
    }
  }

  // Gap
  const codeGap = codeStyles.get('gap');
  if (codeGap !== undefined) {
    const codeNum = parseInt(codeGap);
    if (!isNaN(codeNum) && codeNum !== figmaSpec.gap) {
      add('gap', `${figmaSpec.gap}px`, codeGap, Math.abs(codeNum - figmaSpec.gap) > 4 ? 'warning' : 'info', `Gap differs by ${Math.abs(codeNum - figmaSpec.gap)}px`);
    } else if (!isNaN(codeNum)) {
      add('gap', `${figmaSpec.gap}px`, codeGap, 'pass', 'Matches');
    }
  }

  // Padding
  const padShorthand = codeStyles.get('paddingShorthand');
  if (padShorthand) {
    const parts = padShorthand.split(/\s+/).map(p => parseInt(p) || 0);
    let cp = { top: 0, right: 0, bottom: 0, left: 0 };
    if (parts.length === 4) cp = { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
    else if (parts.length === 2) cp = { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    const fp = figmaSpec.padding;
    const ok = cp.top === fp.top && cp.right === fp.right && cp.bottom === fp.bottom && cp.left === fp.left;
    add('padding', `T:${fp.top} R:${fp.right} B:${fp.bottom} L:${fp.left}`,
      `T:${cp.top} R:${cp.right} B:${cp.bottom} L:${cp.left}`,
      ok ? 'pass' : 'warning', ok ? 'Matches' : 'Padding values differ');
  }

  // Font size
  const codeFontSize = codeStyles.get('fontSize');
  const figmaFont = figmaSpec.font || figmaSpec.children.flatMap(c => c.children || []).find(c => c.font)?.font;
  if (codeFontSize && figmaFont?.size) {
    const codeNum = parseInt(codeFontSize);
    if (!isNaN(codeNum) && codeNum !== figmaFont.size) {
      add('fontSize', `${figmaFont.size}px`, codeFontSize, Math.abs(codeNum - figmaFont.size) > 2 ? 'warning' : 'info', 'Font size differs');
    } else if (!isNaN(codeNum)) {
      add('fontSize', `${figmaFont.size}px`, codeFontSize, 'pass', 'Matches');
    }
  }

  // Line height
  const codeLH = codeStyles.get('lineHeight');
  if (codeLH && figmaFont?.lineHeight) {
    const codeNum = parseInt(codeLH);
    if (!isNaN(codeNum) && codeNum !== figmaFont.lineHeight) {
      add('lineHeight', `${figmaFont.lineHeight}px`, codeLH, 'info', `Differs by ${Math.abs(codeNum - figmaFont.lineHeight)}px`);
    } else if (!isNaN(codeNum)) {
      add('lineHeight', `${figmaFont.lineHeight}px`, codeLH, 'pass', 'Matches');
    }
  }

  // Font weight
  const codeFW = codeStyles.get('fontWeight');
  if (codeFW && figmaFont?.weight) {
    const codeNum = codeFW === 'normal' ? 400 : codeFW === 'bold' ? 700 : parseInt(codeFW);
    if (!isNaN(codeNum) && codeNum !== figmaFont.weight) {
      add('fontWeight', `${figmaFont.weight}`, codeFW, 'warning', 'Font weight differs');
    } else {
      add('fontWeight', `${figmaFont.weight}`, codeFW, 'pass', 'Matches');
    }
  }

  // Background color
  if (figmaSpec.fills.length > 0) {
    const figmaColor = figmaSpec.fills[0].hex.toLowerCase();
    const codeBg = codeStyles.get('backgroundColor');
    if (codeBg) {
      if (codeBg.startsWith('tokens.')) {
        add('backgroundColor', figmaColor, codeBg, 'info', `Code uses token — verify it resolves to ${figmaColor}`);
      } else if (codeBg.toLowerCase() !== figmaColor) {
        add('backgroundColor', figmaColor, codeBg, 'warning', 'Background color differs');
      } else {
        add('backgroundColor', figmaColor, codeBg, 'pass', 'Matches');
      }
    }
  }

  // Text color
  const codeColor = codeStyles.get('color');
  const textChild = findTextNode(figmaSpec);
  if (codeColor && textChild?.fills?.[0]?.hex) {
    const figmaColor = textChild.fills[0].hex.toLowerCase();
    if (codeColor.startsWith('tokens.')) {
      add('color', figmaColor, codeColor, 'info', `Code uses token — verify it resolves to ${figmaColor}`);
    } else if (codeColor.toLowerCase() !== figmaColor) {
      add('color', figmaColor, codeColor, 'warning', 'Text color differs');
    } else {
      add('color', figmaColor, codeColor, 'pass', 'Matches');
    }
  }

  // Size
  const codeMaxW = codeStyles.get('maxWidth');
  if (codeMaxW) {
    const n = parseInt(codeMaxW);
    if (!isNaN(n) && n === figmaSpec.size.width) add('maxWidth', `${figmaSpec.size.width}px`, codeMaxW, 'pass', 'Matches');
    else if (!isNaN(n)) add('maxWidth', `${figmaSpec.size.width}px`, codeMaxW, 'info', 'Max width differs');
  }
  const codeH = codeStyles.get('height');
  if (codeH) {
    const n = parseInt(codeH);
    if (!isNaN(n) && n === figmaSpec.size.height) add('height', `${figmaSpec.size.height}px`, codeH, 'pass', 'Matches');
    else if (!isNaN(n)) add('height', `${figmaSpec.size.height}px`, codeH, Math.abs(n - figmaSpec.size.height) > 4 ? 'warning' : 'info', 'Height differs');
  }

  return findings;
}

function findTextNode(spec: FigmaComponentSpec): FigmaComponentSpec | undefined {
  if (spec.type === 'TEXT') return spec;
  for (const child of spec.children) {
    const found = findTextNode(child);
    if (found) return found;
  }
  return undefined;
}

export interface FocusedComponentMatch {
  node: any;
  path: string;
  componentName: string;
  sectionName: string;
  componentType: 'COMPONENT_SET' | 'COMPONENT' | 'FRAME';
  variantGroup?: VariantGroup;
}

/**
 * Find a node by ID in the Figma tree.
 */
export function findNodeById(root: any, targetId: string, maxDepth = 8, depth = 0): any | null {
  if (root.id === targetId) return root;
  if (depth >= maxDepth || !root.children) return null;
  for (const child of root.children) {
    const found = findNodeById(child, targetId, maxDepth, depth + 1);
    if (found) return found;
  }
  return null;
}

/**
 * Word-boundary match: "citation" matches "citation pill" but not "indentation".
 */
function wordBoundaryMatch(componentName: string, term: string): boolean {
  const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return regex.test(componentName);
}

/**
 * Collect candidate scenarios from manifest at depth 0–2.
 */
function collectCandidates(
  scenarios: FigmaScenario[],
  sectionName: string,
  depth: number,
  maxDepth: number,
): Array<{ scenario: FigmaScenario; sectionName: string }> {
  const results: Array<{ scenario: FigmaScenario; sectionName: string }> = [];
  for (const s of scenarios) {
    const type = s.type as string;
    if (type === 'COMPONENT_SET' || type === 'COMPONENT' || type === 'FRAME') {
      results.push({ scenario: s, sectionName: sectionName || s.name });
    }
    if (depth < maxDepth && s.children) {
      results.push(...collectCandidates(
        s.children,
        sectionName || s.name,
        depth + 1,
        maxDepth,
      ));
    }
  }
  return results;
}

/**
 * Use the page manifest to find focused, top-level components instead of
 * walking the entire Figma tree. Uses word-boundary matching and deduplicates
 * by componentName (preferring COMPONENT_SET instances).
 */
export function findFocusedComponents(
  figmaNode: any,
  manifest: FigmaPageManifest,
  searchTerms: string[],
): FocusedComponentMatch[] {
  const candidates = collectCandidates(manifest.scenarios, '', 0, 2);

  // Build a map from nodeId → VariantGroup for quick lookup
  const variantGroupMap = new Map<string, VariantGroup>();
  for (const vg of manifest.variantGroups) {
    variantGroupMap.set(vg.nodeId, vg);
  }

  // Match candidates against search terms using word-boundary matching
  const matched: FocusedComponentMatch[] = [];
  for (const { scenario, sectionName } of candidates) {
    const name = scenario.componentName;
    if (!name) continue;

    const isMatch = searchTerms.some(term => wordBoundaryMatch(name, term));
    if (!isMatch) continue;

    const rawNode = findNodeById(figmaNode, scenario.nodeId);
    if (!rawNode) continue;

    const componentType = scenario.type as 'COMPONENT_SET' | 'COMPONENT' | 'FRAME';
    matched.push({
      node: rawNode,
      path: scenario.path,
      componentName: name,
      sectionName,
      componentType,
      variantGroup: variantGroupMap.get(scenario.nodeId),
    });
  }

  // Deduplicate by componentName — prefer COMPONENT_SET over others
  const byName = new Map<string, FocusedComponentMatch>();
  for (const m of matched) {
    const existing = byName.get(m.componentName);
    if (!existing || (m.componentType === 'COMPONENT_SET' && existing.componentType !== 'COMPONENT_SET')) {
      byName.set(m.componentName, m);
    }
  }

  return [...byName.values()];
}

/**
 * Check variant coverage: does the code handle each variant from a COMPONENT_SET?
 */
export function compareComponentSet(
  componentSetName: string,
  variantGroup: VariantGroup,
  codeContent: string,
): ComparisonFinding[] {
  const findings: ComparisonFinding[] = [];
  const codeLower = codeContent.toLowerCase();

  // Collect variant property axes (e.g., State: ["Default", "Hover", "Pressed"])
  const axes = new Map<string, Set<string>>();
  for (const v of variantGroup.variants) {
    for (const [prop, val] of Object.entries(v.properties)) {
      if (!axes.has(prop)) axes.set(prop, new Set());
      axes.get(prop)!.add(val);
    }
  }

  // CSS pseudo-class mapping for common state variants
  const stateToCodeSignals: Record<string, string[]> = {
    hover: [':hover', 'hover', 'onmouseenter', 'onpointerenter'],
    pressed: [':active', 'pressed', 'onmousedown', 'onpointerdown'],
    active: [':active', 'active', 'isactive', 'selected'],
    disabled: [':disabled', 'disabled', 'isdisabled', 'aria-disabled'],
    focused: [':focus', 'focus', 'isfocused', 'onfocus'],
    selected: ['selected', 'isselected', 'aria-selected'],
    error: ['error', 'iserror', 'invalid'],
  };

  for (const [prop, values] of axes) {
    const valuesArr = [...values];
    let covered = 0;
    const details: Array<{ value: string; found: boolean }> = [];

    for (const val of valuesArr) {
      const valLower = val.toLowerCase();
      let found = false;

      if (prop.toLowerCase() === 'state' || prop.toLowerCase() === 'status') {
        // Check CSS pseudo-classes and code references
        const signals = stateToCodeSignals[valLower] || [valLower];
        found = signals.some(s => codeLower.includes(s));
      } else {
        // For size/type/etc. — look for the value or prop name in code
        found = codeLower.includes(valLower) || codeLower.includes(prop.toLowerCase());
      }

      if (found) covered++;
      details.push({ value: val, found });
    }

    const missing = details.filter(d => !d.found).map(d => d.value);
    const severity: ComparisonFinding['severity'] =
      covered === valuesArr.length ? 'pass' :
      covered === 0 ? 'warning' : 'warning';

    const message = covered === valuesArr.length
      ? `All ${valuesArr.length} ${prop} variants covered`
      : `${valuesArr.length} ${prop} variants (${valuesArr.join(', ')}) — code covers ${covered}/${valuesArr.length}${missing.length > 0 ? ` (missing: ${missing.join(', ')})` : ''}`;

    findings.push({
      property: `variants:${prop}`,
      figmaValue: valuesArr.join(', '),
      codeValue: `${covered}/${valuesArr.length} covered`,
      severity,
      component: componentSetName,
      message,
    });
  }

  return findings;
}

export function deriveSearchTerms(filePath: string, code: string): string[] {
  const terms: string[] = [];

  // Extract from file path
  const pathParts = filePath.split('/');
  for (const part of pathParts) {
    if (part.includes('.')) continue;
    const words = part.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_-]+/);
    for (const w of words) {
      if (w.length > 2) terms.push(w.toLowerCase());
    }
  }

  // Extract component names from code (function/const/class declarations)
  const componentNameRegex = /(?:export\s+)?(?:function|const|class)\s+([A-Z][a-zA-Z0-9]*)/g;
  let match;
  while ((match = componentNameRegex.exec(code)) !== null) {
    const name = match[1];
    const words = name.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/);
    for (const w of words) {
      if (w.length > 2) terms.push(w.toLowerCase());
    }
  }

  // Extract makeStyles keys
  const makeStylesRegex = /makeStyles\(\s*\{([^}]+)\}/g;
  while ((match = makeStylesRegex.exec(code)) !== null) {
    const block = match[1];
    const keyRegex = /(\w+)\s*:/g;
    let keyMatch;
    while ((keyMatch = keyRegex.exec(block)) !== null) {
      const key = keyMatch[1];
      if (key.length > 2 && key !== 'display' && key !== 'padding' && key !== 'margin') {
        const words = key.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/);
        for (const w of words) {
          if (w.length > 2) terms.push(w.toLowerCase());
        }
      }
    }
  }

  return [...new Set(terms)];
}
