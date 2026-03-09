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

  const flatRows = useMemo(() => {
    const rows: FlatRow[] = [];

    for (const comp of result.components) {
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
      {/* Header card with bento-style metrics */}
      <div className="rounded bg-panel-surface border border-border p-6 mb-5 relative overflow-hidden">
        {/* Prismatic top accent */}
        <div className="absolute top-0 left-0 right-0 prism-bar" />
        <div className="flex items-center gap-3 mt-1">
          {severityIcon[overallStatus]}
          <h2 className="text-xs font-semibold tracking-widest uppercase text-ink">Analysis Report</h2>
        </div>

        <div className="flex gap-8 mt-4 flex-wrap">
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-ink-muted tracking-widest uppercase font-medium">PR</span>
            <span className="text-ink text-xs">
              <strong>{result.prTitle}</strong>
              {result.prId > 0 && <span className="text-ink-muted"> (#{result.prId})</span>}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-ink-muted tracking-widest uppercase font-medium">Figma</span>
            <a href={result.figmaUrl} target="_blank" rel="noopener" className="text-accent hover:text-accent-bright text-xs font-medium">
              {result.figmaPageName}
            </a>
          </div>
          {result.adoProject && result.prId > 0 && (
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-ink-muted tracking-widest uppercase font-medium">ADO</span>
              <a
                href={`https://dev.azure.com/office/${result.adoProject}/_git/${result.repoName}/pullrequest/${result.prId}`}
                target="_blank"
                rel="noopener"
                className="text-accent hover:text-accent-bright text-xs"
              >
                View PR
              </a>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-ink-muted tracking-widest uppercase font-medium">Files</span>
            <span className="text-ink text-xs">{result.codeFiles.length}</span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] text-ink-muted tracking-widest uppercase font-medium">Components</span>
            <span className="text-ink text-xs">{result.components.length}</span>
          </div>
        </div>

        {/* Bento metrics grid — large hero numbers like the reference */}
        <div className="grid grid-cols-4 gap-3 mt-5">
          <div className="flex flex-col p-4 rounded bg-panel-base border border-border relative overflow-hidden">
            <span className="text-[10px] text-ink-muted tracking-widest uppercase mb-2">Errors</span>
            <span className={`text-4xl font-bold leading-none ${severityColor.error}`}>{summary.errors}</span>
            {summary.errors > 0 && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-sev-error/40" />}
          </div>
          <div className="flex flex-col p-4 rounded bg-panel-base border border-border relative overflow-hidden">
            <span className="text-[10px] text-ink-muted tracking-widest uppercase mb-2">Warnings</span>
            <span className={`text-4xl font-bold leading-none ${severityColor.warning}`}>{summary.warnings}</span>
            {summary.warnings > 0 && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-sev-warning/40" />}
          </div>
          <div className="flex flex-col p-4 rounded bg-panel-base border border-border relative overflow-hidden">
            <span className="text-[10px] text-ink-muted tracking-widest uppercase mb-2">Info</span>
            <span className={`text-4xl font-bold leading-none ${severityColor.info}`}>{summary.info}</span>
            {summary.info > 0 && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-sev-info/40" />}
          </div>
          <div className="flex flex-col p-4 rounded bg-panel-base border border-border relative overflow-hidden">
            <span className="text-[10px] text-ink-muted tracking-widest uppercase mb-2">Passes</span>
            <span className={`text-4xl font-bold leading-none ${severityColor.pass}`}>{summary.passes}</span>
            {summary.passes > 0 && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-sev-pass/40" />}
          </div>
        </div>
      </div>

      <AISummaryPanel aiSummary={result.aiSummary} aiSummaryStatus={result.aiSummaryStatus} />

      {result.components.length === 0 && (
        <div className="rounded bg-panel-surface border border-border p-5 text-ink-muted text-xs">
          No matching Figma components found for the code changes.
        </div>
      )}

      {flatRows.length > 0 && (
        <div>
          <button
            onClick={() => setDetailsExpanded(prev => !prev)}
            className="flex items-center gap-2 text-xs font-medium text-ink-muted hover:text-ink transition-colors mb-4"
          >
            {detailsExpanded
              ? <ChevronDown className="h-3.5 w-3.5" />
              : <ChevronRight className="h-3.5 w-3.5" />}
            <span className="tracking-wider uppercase text-[10px]">
              Comparison ({flatRows.length} findings / {result.components.length} components)
            </span>
          </button>

          {detailsExpanded && (
            <div className="rounded bg-panel-surface border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-[10px] text-ink-muted tracking-widest uppercase border-b border-border">
                    <th className="px-4 py-3 font-medium" style={{ width: 80 }}>Status</th>
                    <th className="px-4 py-3 font-medium" style={{ width: 160 }}>Component</th>
                    <th className="px-4 py-3 font-medium" style={{ width: 140 }}>Property</th>
                    <th className="px-4 py-3 font-medium">Design</th>
                    <th className="px-4 py-3 font-medium">Code</th>
                    <th className="px-4 py-3 font-medium">Diff</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {flatRows.map((row, i) => (
                    <tr key={i} className="hover:bg-panel-hover/50">
                      <td className="px-4 py-3"><SeverityBadge severity={row.severity} /></td>
                      <td className="px-4 py-3 font-medium text-ink">{row.component}</td>
                      <td className="px-4 py-3 font-medium text-ink-secondary">{row.property}</td>
                      <td className="px-4 py-3">
                        <code className="text-[11px] bg-panel-base text-ink-secondary px-1.5 py-0.5 rounded border border-border-subtle">{row.designSpec}</code>
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-[11px] bg-panel-base text-ink-secondary px-1.5 py-0.5 rounded border border-border-subtle">{row.codeImpl}</code>
                      </td>
                      <td className="px-4 py-3 text-ink-muted">{row.difference}</td>
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
