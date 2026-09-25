import { cn } from '../../utils/cn';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}

const SIZES = { sm: 'size-4 border-2', md: 'size-6 border-[2.5px]', lg: 'size-9 border-[3px]' };

/** A simple rotating ring — used inside buttons and for full-screen waits. */
export function LoadingSpinner({ size = 'md', className, label }: LoadingSpinnerProps) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2', className)}>
      <span
        className={cn(
          'animate-spin rounded-full border-current border-t-transparent opacity-80',
          SIZES[size],
        )}
      />
      {label && <span className="text-sm text-slate-500">{label}</span>}
      <span className="sr-only">Loading…</span>
    </span>
  );
}

/** Three skeleton rows, shaped like a mail-list item, for first-load states. */
export function MailListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 px-4 py-3.5">
          <div className="skeleton size-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="skeleton h-3.5 w-1/3 rounded-full" />
            <div className="skeleton h-3 w-2/3 rounded-full" />
          </div>
        </li>
      ))}
    </ul>
  );
}
