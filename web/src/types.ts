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

export interface FigmaSearchResult {
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
  type: string;
  nodeId: string;
  componentName: string;
  variantProperties?: Record<string, string>;
  children: FigmaScenario[];
}

export interface VariantGroupInfo {
  componentSetName: string;
  nodeId: string;
  variants: Array<{
    name: string;
    nodeId: string;
    properties: Record<string, string>;
  }>;
}

export interface PageManifest {
  pageId: string;
  pageName: string;
  scenarios: FigmaScenario[];
  totalCount: number;
  componentNames: string[];
  variantGroups: VariantGroupInfo[];
}

export interface FigmaTeam {
  id: string;
  name: string;
}

export interface AppSettings {
  figmaPat: string;
  figmaTeamIds: string;
  adoPat: string;
  adoOrgUrl: string;
  adoDefaultProject: string;
}

export interface AdoProject {
  id: string;
  name: string;
  description: string;
}

export interface AdoRepo {
  id: string;
  name: string;
  project: string;
}

export interface CraftPR {
  pullRequestId: number;
  title: string;
  description: string;
  createdBy: string;
  creationDate: string;
  sourceRefName: string;
  repositoryId: string;
  repositoryName: string;
  project: string;
  uiFiles: string[];
  componentNames: string[];
}

export interface FigmaMatchResult {
  figmaFileKey: string;
  figmaFileName: string;
  figmaUrl: string;
  matchedComponent: string;
  score: number;
}

export interface PRMatchResult {
  pullRequestId: number;
  title: string;
  createdBy: string;
  creationDate: string;
  repositoryName: string;
  project: string;
  repositoryId: string;
  sourceRefName: string;
  matchedComponent: string;
  score: number;
  uiFiles: string[];
  matchReason?: string;
}

export interface ReviewPrefill {
  figmaUrl: string;
  prId: string;
  adoProject: string;
  adoRepoId: string;
}

export interface AnalysisResult {
  id: string;
  status: 'completed' | 'failed';
  createdAt: string;
  figmaUrl: string;
  figmaPageName: string;
  prTitle: string;
  prId: number;
  adoProject: string;
  repoName: string;
  components: ComponentComparison[];
  summary: { errors: number; warnings: number; info: number; passes: number };
  codeFiles: string[];
  error?: string;
  aiSummary?: string;
  aiSummaryStatus?: 'pending' | 'generating' | 'completed' | 'failed' | 'unavailable';
}

export interface ContentMatchResult {
  prId: number;
  contentScore: number;
  sharedComponents: Array<{ figmaName: string; codeName: string; similarity: number }>;
  sharedTexts: Array<{ figmaText: string; codeName: string; similarity: number }>;
  figmaPageName: string;
  figmaComponentCount: number;
  codeComponentCount: number;
}

export interface FigmaContentInfo {
  pageName: string;
  componentNames: string[];
  textSamples: string[];
  componentCount: number;
}

export interface CompletenessReport {
  coveredScenarios: Array<{
    figmaScenario: string;
    figmaNodeId: string;
    codeMatch: string;
    matchType: string;
    confidence: number;
  }>;
  missingFromCode: Array<{ name: string; source: string; details?: string }>;
  missingFromFigma: Array<{ name: string; source: string; details?: string }>;
  coveragePercentage: number;
}
