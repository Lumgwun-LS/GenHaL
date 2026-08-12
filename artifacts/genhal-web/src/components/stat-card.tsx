import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type StatColor = 'terracotta' | 'forest' | 'gold' | 'neutral';

const COLORS: Record<StatColor, { bar: string; chip: string }> = {
  terracotta: {
    bar: 'from-primary to-accent',
    chip: 'bg-primary/10 text-primary',
  },
  forest: {
    bar: 'from-secondary to-secondary/60',
    chip: 'bg-secondary/10 text-secondary',
  },
  gold: {
    bar: 'from-accent to-primary',
    chip: 'bg-accent/15 text-accent-foreground dark:text-accent',
  },
  neutral: {
    bar: 'from-muted-foreground/40 to-muted-foreground/10',
    chip: 'bg-muted text-muted-foreground',
  },
};

interface StatCardProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
  color?: StatColor;
  className?: string;
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  color = 'terracotta',
  className,
}: StatCardProps) {
  const c = COLORS[color];

  return (
    <div
      className={cn(
        'relative overflow-hidden border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-card-hover',
        className,
      )}
      style={{ borderRadius: 'var(--theme-card-radius, 12px)' }}
    >
      <div
        className={cn(
          'absolute inset-x-0 top-0 h-0.5 bg-linear-to-r opacity-70',
          c.bar,
        )}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-extrabold leading-tight text-foreground">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {hint && (
            <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
          )}
        </div>
        {icon && (
          <div
            className={cn(
              'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
              c.chip,
            )}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
