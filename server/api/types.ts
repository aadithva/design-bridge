import type { ComponentComparison } from '../services/comparison/component-matcher.js';

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
