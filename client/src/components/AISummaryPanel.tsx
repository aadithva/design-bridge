import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Loader2, AlertTriangle, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import type { Components } from 'react-markdown';

const markdownComponents: Components = {
  h1: ({ children }) => <h1 className="text-sm font-bold text-ink mt-5 mb-2 tracking-wider uppercase">{children}</h1>,
  h2: ({ children }) => <h2 className="text-xs font-semibold text-ink mt-4 mb-2 tracking-wider uppercase">{children}</h2>,
  h3: ({ children }) => <h3 className="text-xs font-semibold text-ink-secondary mt-3 mb-1.5">{children}</h3>,
  h4: ({ children }) => <h4 className="text-xs font-medium text-ink-secondary mt-2 mb-1">{children}</h4>,
  p: ({ children }) => <p className="text-ink-secondary text-xs leading-relaxed mb-2">{children}</p>,
  ul: ({ children }) => <ul className="list-disc list-inside text-ink-secondary text-xs mb-2 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal list-inside text-ink-secondary text-xs mb-2 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="text-ink-secondary text-xs">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-bright underline">
      {children}
    </a>
  ),
  code: ({ children, className }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className="block bg-panel-base text-ink-secondary text-[11px] rounded p-3 mb-2 overflow-x-auto border border-border-subtle">
          {children}
        </code>
      );
    }
    return <code className="bg-panel-base text-ink-secondary text-[11px] px-1 py-0.5 rounded border border-border-subtle">{children}</code>;
  },
  pre: ({ children }) => <pre className="mb-2">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent/30 bg-accent-dim/30 pl-3 py-1.5 mb-2 text-ink-secondary text-xs italic">
      {children}
    </blockquote>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-2">
      <table className="min-w-full text-xs border border-border rounded overflow-hidden">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-panel-base">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 text-left text-[10px] font-medium text-ink-muted tracking-widest uppercase border-b border-border">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 text-ink-secondary text-xs border-b border-border-subtle">{children}</td>,
  hr: () => <hr className="border-border my-3" />,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic text-ink-secondary">{children}</em>,
};

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
  const emoji = emojiMatch ? emojiMatch[1] : '';
  const rest = emojiMatch ? titleText.slice(emojiMatch[0].length) : titleText;

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
    <div className="border border-border rounded overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-panel-base hover:bg-panel-hover transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-ink-muted flex-shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-ink-muted flex-shrink-0" />
        )}
        <span className="font-medium text-ink text-xs">{title}</span>
      </button>
      {expanded && (
        <div className="px-4 py-3 max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

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
      <div className="rounded bg-panel-surface border border-border p-6 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="text-xs font-semibold tracking-wider uppercase text-ink">AI Analysis</h2>
        </div>
        <div className="flex items-center gap-3 text-ink-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          <div>
            <p className="font-medium text-xs">Generating...</p>
            <p className="text-[10px] text-ink-faint mt-0.5">30-60 seconds</p>
          </div>
        </div>
        <div className="mt-4 space-y-2 animate-pulse">
          <div className="h-3 bg-panel-hover rounded w-3/4" />
          <div className="h-3 bg-panel-hover rounded w-full" />
          <div className="h-3 bg-panel-hover rounded w-5/6" />
          <div className="h-3 bg-panel-hover rounded w-2/3" />
        </div>
      </div>
    );
  }

  if (aiSummaryStatus === 'failed') {
    return (
      <div className="rounded bg-sev-warning/10 border border-sev-warning/20 p-5 mb-5">
        <div className="flex items-center gap-2 text-sev-warning">
          <AlertTriangle className="h-4 w-4" />
          <p className="font-medium text-xs">AI summary failed</p>
        </div>
        <p className="text-[10px] text-ink-muted mt-1">
          Mechanical findings are still available below.
        </p>
      </div>
    );
  }

  const md = aiSummary || '';
  const { header, sections } = parseSections(md);
  const verdict = parseVerdictBanner(header);

  if (sections.length === 0) {
    return (
      <div className="rounded bg-panel-surface border border-border p-6 mb-5">
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="text-xs font-semibold tracking-wider uppercase text-ink">AI Analysis</h2>
        </div>
        <div className="max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {md}
          </ReactMarkdown>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded bg-panel-surface border border-border p-6 mb-5">
      <div className="flex items-center gap-3 mb-4">
        <Sparkles className="h-4 w-4 text-accent" />
        <h2 className="text-xs font-semibold tracking-wider uppercase text-ink">AI Analysis</h2>
      </div>

      {verdict && (
        <div className="flex items-center gap-3 px-4 py-2.5 mb-4 bg-panel-base rounded border border-border">
          {verdict.emoji && <span className="text-base">{verdict.emoji}</span>}
          <span className="font-medium text-ink text-xs">{verdict.title}</span>
          {verdict.stats && (
            <>
              <span className="text-ink-faint">|</span>
              <span className="text-[10px] text-ink-muted tracking-wider">{verdict.stats}</span>
            </>
          )}
        </div>
      )}

      {header.trim() && (
        <div className="max-w-none mb-4">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {header}
          </ReactMarkdown>
        </div>
      )}

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
