import type { ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { clsx } from 'clsx';

export type Severity = 'error' | 'warning' | 'info' | 'pass';

export const severityIcon: Record<Severity, ReactNode> = {
  error: <XCircle className="h-5 w-5 text-sev-error" />,
  warning: <AlertTriangle className="h-5 w-5 text-sev-warning" />,
  info: <Info className="h-5 w-5 text-sev-info" />,
  pass: <CheckCircle2 className="h-5 w-5 text-sev-pass" />,
};

export const severityLabel: Record<Severity, string> = {
  error: 'ERROR',
  warning: 'WARN',
  info: 'INFO',
  pass: 'PASS',
};

export const severityColor: Record<Severity, string> = {
  error: 'text-sev-error',
  warning: 'text-sev-warning',
  info: 'text-sev-info',
  pass: 'text-sev-pass',
};

const badgeClass: Record<Severity, string> = {
  error: 'bg-sev-error/15 text-sev-error border-sev-error/20',
  warning: 'bg-sev-warning/15 text-sev-warning border-sev-warning/20',
  info: 'bg-sev-info/15 text-sev-info border-sev-info/20',
  pass: 'bg-sev-pass/15 text-sev-pass border-sev-pass/20',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={clsx('px-2 py-0.5 rounded text-[10px] font-semibold tracking-wider uppercase border', badgeClass[severity])}>
      {severityLabel[severity]}
    </span>
  );
}
