import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SeverityBadge, severityIcon, severityColor } from './SeverityBadge';
import { AISummaryPanel } from './AISummaryPanel';
import type { AnalysisResult, ComparisonFinding } from '../types';

interface FlatRow {
  severity: ComparisonFinding['severity'];
  component: string;
  property: string;
  designSpec: string;
  codeImpl: string;
  difference: string;
}

const severityOrder: Record<string, number> = { error: 0, warning: 1, info: 2, pass: 3 };

export function AnalysisReport({ result }: { result: AnalysisResult }) {
  const { summary } = result;
  const overallStatus = summary.errors > 0 ? 'error' : summary.warnings > 0 ? 'warning' : 'pass';

  const hasAiSummary = result.aiSummaryStatus === 'completed' && !!result.aiSummary;
  const [detailsExpanded, setDetailsExpanded] = useState(!hasAiSummary);

  // Flatten all findings + variant coverage into a single sorted list
  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];

    for (const comp of result.components) {
      // Regular findings
      for (const f of comp.findings) {
        rows.push({
          severity: f.severity,
          component: comp.componentName,
          property: f.property,
          designSpec: f.figmaValue,
          codeImpl: f.codeValue,
          difference: f.message,
        });
      }

      // Variant coverage row for COMPONENT_SET
      if (comp.componentType === 'COMPONENT_SET' && comp.variantCount != null && comp.variantsCovered != null) {
        const missing = comp.variantDetails
          ?.filter(v => !v.covered)
          .map(v => v.name) || [];
        const allCovered = comp.variantsCovered === comp.variantCount;
        rows.push({
          severity: allCovered ? 'pass' : 'warning',
          component: comp.componentName,
          property: 'Variant Coverage',
          designSpec: `${comp.variantCount} variants`,
          codeImpl: `${comp.variantsCovered} covered`,
          difference: missing.length > 0 ? `Missing: ${missing.join(', ')}` : 'All variants covered',
        });
      }
    }

    rows.sort((a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9));
    return rows;
  }, [result.components]);

  return (
    <div>
      <div className="rounded-2xl bg-white shadow-soft p-8 mb-6">
        <div className="flex items-center gap-3">
          {severityIcon[overallStatus]}
          <h2 className="text-2xl font-semibold text-slate-900">Analysis Report</h2>
        </div>

        <div className="flex gap-8 mt-4 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">PR</span>
            <span className="text-slate-900">
              <strong>{result.prTitle}</strong>
              {result.prId > 0 && <span className="text-slate-400"> (#{result.prId})</span>}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Figma Page</span>
            <a href={result.figmaUrl} target="_blank" rel="noopener" className="text-blue-600 hover:text-blue-700 font-semibold">
              {result.figmaPageName}
            </a>
          </div>
          {result.adoProject && result.prId > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">ADO PR</span>
              <a
                href={`https://dev.azure.com/office/${result.adoProject}/_git/${result.repoName}/pullrequest/${result.prId}`}
                target="_blank"
                rel="noopener"
                className="text-blue-600 hover:text-blue-700"
              >
                View in ADO
              </a>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Code Files</span>
            <span className="text-slate-900">{result.codeFiles.length}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-slate-400 uppercase tracking-wider font-medium">Components</span>
            <span className="text-slate-900">{result.components.length}</span>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="flex flex-col items-center p-5 rounded-xl bg-slate-50">
            <span className={`text-3xl font-bold ${severityColor.error}`}>{summary.errors}</span>
            <span className="text-sm text-slate-500 mt-1">Errors</span>
          </div>
          <div className="flex flex-col items-center p-5 rounded-xl bg-slate-50">
            <span className={`text-3xl font-bold ${severityColor.warning}`}>{summary.warnings}</span>
            <span className="text-sm text-slate-500 mt-1">Warnings</span>
          </div>
          <div className="flex flex-col items-center p-5 rounded-xl bg-slate-50">
            <span className={`text-3xl font-bold ${severityColor.info}`}>{summary.info}</span>
            <span className="text-sm text-slate-500 mt-1">Info</span>
          </div>
          <div className="flex flex-col items-center p-5 rounded-xl bg-slate-50">
            <span className={`text-3xl font-bold ${severityColor.pass}`}>{summary.passes}</span>
            <span className="text-sm text-slate-500 mt-1">Passes</span>
          </div>
        </div>
      </div>

      <AISummaryPanel aiSummary={result.aiSummary} aiSummaryStatus={result.aiSummaryStatus} />

      {result.components.length === 0 && (
        <div className="rounded-2xl bg-white shadow-soft p-6 text-slate-500">
          No matching Figma components found for the code changes.
        </div>
      )}

      {flatRows.length > 0 && (
        <div>
          <button
            onClick={() => setDetailsExpanded(prev => !prev)}
            className="flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors mb-4"
          >
            {detailsExpanded
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
            Design vs Code Comparison ({flatRows.length} findings across {result.components.length} components)
          </button>

          {detailsExpanded && (
            <div className="rounded-2xl bg-white shadow-soft overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3 font-medium" style={{ width: 80 }}>Status</th>
                    <th className="px-4 py-3 font-medium" style={{ width: 160 }}>Component</th>
                    <th className="px-4 py-3 font-medium" style={{ width: 140 }}>Property</th>
                    <th className="px-4 py-3 font-medium">Design Spec</th>
                    <th className="px-4 py-3 font-medium">Code Implementation</th>
                    <th className="px-4 py-3 font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {flatRows.map((row, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3"><SeverityBadge severity={row.severity} /></td>
                      <td className="px-4 py-3 font-medium text-slate-900">{row.component}</td>
                      <td className="px-4 py-3 font-semibold text-slate-700">{row.property}</td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-slate-50 text-slate-700 px-2 py-0.5 rounded-md">{row.designSpec}</code>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-slate-50 text-slate-700 px-2 py-0.5 rounded-md">{row.codeImpl}</code>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{row.difference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
