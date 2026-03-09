import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, AlertTriangle, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import type { Components } from 'react-markdown';

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-bold text-slate-900 mt-6 mb-3">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xl font-semibold text-slate-900 mt-5 mb-2">{children}</h2>,
  h3: ({ children }) => <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-2">{children}</h3>,
  h4: ({ children }) => <h4 className="text-base font-semibold text-slate-700 mt-3 mb-1">{children}</h4>,
  p: ({ children }) => <p className="text-slate-700 leading-relaxed mb-3">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside text-slate-700 mb-3 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside text-slate-700 mb-3 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="text-slate-700">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-700 underline">
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className="block bg-slate-50 text-slate-800 text-sm rounded-lg p-4 mb-3 overflow-x-auto font-mono">
          {children}
        </code>
      );
    }
    return <code className="bg-slate-100 text-slate-800 text-sm px-1.5 py-0.5 rounded font-mono">{children}</code>;
  },
  pre: ({ children }) => <pre className="mb-3">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-blue-200 bg-blue-50/50 pl-4 py-2 mb-3 text-slate-600 italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-3">
      <table className="min-w-full text-sm border border-slate-200 rounded-lg overflow-hidden">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-slate-50">{children}</thead>,
  th: ({ children }) => <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-200">{children}</th>,
  td: ({ children }) => <td className="px-4 py-2 text-slate-700 border-b border-slate-100">{children}</td>,
  hr: () => <hr className="border-slate-200 my-4" />,
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
  em: ({ children }) => <em className="italic text-slate-600">{children}</em>,
};

// --- Parsing & section helpers ---

interface ParsedSection {
  title: string;
  content: string;
}

function parseSections(md: string): { header: string; sections: ParsedSection[] } {
  const lines = md.split('\n');
  let header = '';
  const sections: ParsedSection[] = [];
  let currentTitle = '';
  let currentLines: string[] = [];
  let inHeader = true;

  for (const line of lines) {
    if (line.startsWith('### ')) {
      if (inHeader) {
        header = currentLines.join('\n');
        inHeader = false;
      } else if (currentTitle) {
        sections.push({ title: currentTitle, content: currentLines.join('\n') });
      }
      currentTitle = line.replace('### ', '');
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  if (currentTitle) {
    sections.push({ title: currentTitle, content: currentLines.join('\n') });
  } else if (inHeader) {
    header = currentLines.join('\n');
  }

  return { header, sections };
}

function shouldDefaultExpand(title: string): boolean {
  const lower = title.toLowerCase();
  return (
    lower.includes('executive summary') ||
    lower.includes('final verdict') ||
    lower.includes('summary & recommendations') ||
    lower.includes('summary and recommendations')
  );
}

function parseVerdictBanner(header: string): { emoji: string; title: string; stats: string } | null {
  const lines = header.split('\n');
  const h2Line = lines.find((l) => l.startsWith('## '));
  if (!h2Line) return null;

  const titleText = h2Line.replace('## ', '').trim();
  const emojiMatch = titleText.match(/^([\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2700}-\u{27BF}✅⚠️❌🟡🟢🔴]+)\s*/u);
  const emoji = emojiMatch ? emojiMatch[1] : '📋';
  const rest = emojiMatch ? titleText.slice(emojiMatch[0].length) : titleText;

  // Try to extract counts from the metrics table
  const tableLines = lines.filter((l) => l.includes('|'));
  let errors = 0, warnings = 0, info = 0;
  for (const tl of tableLines) {
    const lower = tl.toLowerCase();
    const numMatch = tl.match(/(\d+)/);
    if (!numMatch) continue;
    const n = parseInt(numMatch[1], 10);
    if (lower.includes('error') || lower.includes('❌')) errors += n;
    else if (lower.includes('warning') || lower.includes('⚠️') || lower.includes('🟡')) warnings += n;
    else if (lower.includes('info') || lower.includes('ℹ️') || lower.includes('suggestion')) info += n;
  }

  const parts: string[] = [];
  if (errors > 0) parts.push(`${errors} error${errors !== 1 ? 's' : ''}`);
  if (warnings > 0) parts.push(`${warnings} warning${warnings !== 1 ? 's' : ''}`);
  if (info > 0) parts.push(`${info} info`);
  const stats = parts.length > 0 ? parts.join(', ') : '';

  return { emoji, title: rest, stats };
}

function SummarySection({ title, content, defaultExpanded }: { title: string; content: string; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
        )}
        <span className="font-semibold text-slate-800 text-sm">{title}</span>
      </button>
      {expanded && (
        <div className="px-4 py-3 prose-slate max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

// --- Component ---

interface AISummaryPanelProps {
  aiSummary?: string;
  aiSummaryStatus?: 'pending' | 'generating' | 'completed' | 'failed' | 'unavailable';
}

export function AISummaryPanel({ aiSummary, aiSummaryStatus }: AISummaryPanelProps) {
  if (!aiSummaryStatus || aiSummaryStatus === 'unavailable') {
    return null;
  }

  if (aiSummaryStatus === 'pending' || aiSummaryStatus === 'generating') {
    return (
      <div className="rounded-2xl bg-white shadow-soft p-8 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="h-5 w-5 text-violet-500" />
          <h2 className="text-lg font-semibold text-slate-900">AI Analysis</h2>
        </div>
        <div className="flex items-center gap-3 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
          <div>
            <p className="font-medium">Generating AI analysis...</p>
            <p className="text-sm text-slate-400 mt-0.5">This typically takes 30–60 seconds</p>
          </div>
        </div>
        <div className="mt-4 space-y-3 animate-pulse">
          <div className="h-4 bg-slate-100 rounded w-3/4" />
          <div className="h-4 bg-slate-100 rounded w-full" />
          <div className="h-4 bg-slate-100 rounded w-5/6" />
          <div className="h-4 bg-slate-100 rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (aiSummaryStatus === 'failed') {
    return (
      <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6 mb-6">
        <div className="flex items-center gap-2 text-amber-700">
          <AlertTriangle className="h-5 w-5" />
          <p className="font-medium">AI summary generation failed</p>
        </div>
        <p className="text-sm text-amber-600 mt-1">
          The detailed mechanical findings below are still available.
        </p>
      </div>
    );
  }

  // completed — structured panel
  const md = aiSummary || '';
  const { header, sections } = parseSections(md);
  const verdict = parseVerdictBanner(header);

  // If no sections were parsed (no ### headings), fall back to plain rendering
  if (sections.length === 0) {
    return (
      <div className="rounded-2xl bg-white shadow-soft p-8 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="h-5 w-5 text-violet-500" />
          <h2 className="text-lg font-semibold text-slate-900">AI Analysis</h2>
        </div>
        <div className="prose-slate max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {md}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white shadow-soft p-8 mb-6">
      <div className="flex items-center gap-3 mb-4">
        <Sparkles className="h-5 w-5 text-violet-500" />
        <h2 className="text-lg font-semibold text-slate-900">AI Analysis</h2>
      </div>

      {/* Verdict banner */}
      {verdict && (
        <div className="flex items-center gap-3 px-4 py-3 mb-4 bg-slate-50 rounded-xl border border-slate-200">
          <span className="text-xl">{verdict.emoji}</span>
          <span className="font-semibold text-slate-800">{verdict.title}</span>
          {verdict.stats && (
            <>
              <span className="text-slate-300">—</span>
              <span className="text-sm text-slate-500">{verdict.stats}</span>
            </>
          )}
        </div>
      )}

      {/* Header (content before first ### — metrics table, etc.) */}
      {header.trim() && (
        <div className="prose-slate max-w-none mb-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {header}
          </ReactMarkdown>
        </div>
      )}

      {/* Collapsible sections */}
      <div className="space-y-2">
        {sections.map((section) => (
          <SummarySection
            key={section.title}
            title={section.title}
            content={section.content}
            defaultExpanded={shouldDefaultExpand(section.title)}
          />
        ))}
      </div>
    </div>
  );
}
