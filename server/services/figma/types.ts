/** Figma REST API response types */

export interface FigmaFileResponse {
  name: string;
  lastModified: string;
  version: string;
  document: FigmaNode;
}

export interface FigmaNode {
  id: string;
  name: string;
  type: FigmaNodeType;
  children?: FigmaNode[];
  fills?: FigmaPaint[];
  strokes?: FigmaPaint[];
  style?: FigmaTextStyle;
  cornerRadius?: number;
  rectangleCornerRadii?: number[];
  layoutMode?: 'HORIZONTAL' | 'VERTICAL' | 'NONE';
  itemSpacing?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingTop?: number;
  paddingBottom?: number;
  absoluteBoundingBox?: { x: number; y: number; width: number; height: number };
  componentId?: string;
  characters?: string;
}

export type FigmaNodeType =
  | 'DOCUMENT'
  | 'CANVAS'
  | 'FRAME'
  | 'GROUP'
  | 'VECTOR'
  | 'BOOLEAN_OPERATION'
  | 'STAR'
  | 'LINE'
  | 'ELLIPSE'
  | 'REGULAR_POLYGON'
  | 'RECTANGLE'
  | 'TEXT'
  | 'SLICE'
  | 'COMPONENT'
  | 'COMPONENT_SET'
  | 'INSTANCE';

export interface FigmaPaint {
  type: 'SOLID' | 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'IMAGE';
  color?: FigmaColor;
  opacity?: number;
  visible?: boolean;
}

export interface FigmaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FigmaTextStyle {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeightPx?: number;
  lineHeightPercent?: number;
  letterSpacing?: number;
  textAlignHorizontal?: string;
}

export interface FigmaImageResponse {
  images: Record<string, string | null>;
}

export interface FigmaComponentMeta {
  key: string;
  name: string;
  description: string;
}

export interface DesignTokens {
  colors: ColorToken[];
  typography: TypographyToken[];
  spacing: SpacingToken[];
  borderRadius: BorderRadiusToken[];
  components: ComponentToken[];
}

export interface ColorToken {
  hex: string;
  rgba: { r: number; g: number; b: number; a: number };
  source: string; // node name or path
  usage: 'fill' | 'stroke';
}

export interface TypographyToken {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  lineHeight?: number;
  source: string;
}

export interface SpacingToken {
  type: 'itemSpacing' | 'paddingLeft' | 'paddingRight' | 'paddingTop' | 'paddingBottom';
  value: number;
  source: string;
}

export interface BorderRadiusToken {
  value: number;
  source: string;
}

export interface ComponentToken {
  name: string;
  instanceCount: number;
}

export interface PorPageResult {
  pageId: string;
  pageName: string;
  confidence: number;
  signals: string[];
}

export interface ExportedFrame {
  nodeId: string;
  name: string;
  imageUrl: string;
  imageBuffer: Buffer;
  width: number;
  height: number;
}

export interface FigmaProjectInfo {
  id: number;
  name: string;
}

export interface FigmaFileInfo {
  key: string;
  name: string;
  thumbnail_url: string;
  last_modified: string;
}

export interface FigmaFileSearchResult {
  fileKey: string;
  name: string;
  projectName: string;
  projectId: number;
  figmaUrl: string;
  thumbnailUrl: string;
  lastModified: string;
  relevanceScore: number;
}

export interface FigmaScenario {
  name: string;
  type: FigmaNodeType;
  nodeId: string;
  path: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  componentName: string;
  variantProperties?: Record<string, string>;
  children: FigmaScenario[];
}

export interface VariantGroup {
  componentSetName: string;
  nodeId: string;
  variants: Array<{
    name: string;
    nodeId: string;
    properties: Record<string, string>;
  }>;
}

export interface FigmaPageManifest {
  pageId: string;
  pageName: string;
  scenarios: FigmaScenario[];
  totalCount: number;
  componentNames: string[];
  variantGroups: VariantGroup[];
}

export interface RelevantPagesResult {
  porPage: PorPageResult | null;
  redlinesPage: PorPageResult | null;
  allScoredPages: PorPageResult[];
}

export interface CompletenessReport {
  coveredScenarios: CoverageEntry[];
  missingFromCode: MissingEntry[];
  missingFromFigma: MissingEntry[];
  coveragePercentage: number;
}

export interface CoverageEntry {
  figmaScenario: string;
  figmaNodeId: string;
  codeMatch: string;
  matchType: 'exact' | 'normalized' | 'fuzzy' | 'substring';
  confidence: number;
}

export interface MissingEntry {
  name: string;
  source: 'figma' | 'code';
  details?: string;
}
