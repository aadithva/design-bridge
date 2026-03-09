import type { ReactNode } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';
import { clsx } from 'clsx';

export type Severity = 'error' | 'warning' | 'info' | 'pass';

export const severityIcon: Record<Severity, ReactNode> = {
  error: <XCircle className="h-5 w-5 text-red-500" />,
  warning: <AlertTriangle className="h-5 w-5 text-amber-500" />,
  info: <Info className="h-5 w-5 text-blue-500" />,
  pass: <CheckCircle2 className="h-5 w-5 text-green-600" />,
};

export const severityLabel: Record<Severity, string> = {
  error: 'Error',
  warning: 'Warning',
  info: 'Info',
  pass: 'Pass',
};

export const severityColor: Record<Severity, string> = {
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
  pass: 'text-green-600',
};

const badgeClass: Record<Severity, string> = {
  error: 'bg-red-100 text-red-700',
  warning: 'bg-amber-100 text-amber-700',
  info: 'bg-blue-100 text-blue-700',
  pass: 'bg-green-100 text-green-700',
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium', badgeClass[severity])}>
      {severityLabel[severity]}
    </span>
  );
}
