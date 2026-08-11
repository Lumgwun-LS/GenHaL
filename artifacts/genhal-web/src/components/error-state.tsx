import { AlertTriangle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';

interface ErrorStateProps {
  /** What failed to load, e.g. "family trees". */
  subject: string;
  onRetry?: () => void;
  className?: string;
}

/**
 * Shown when a query errors.
 *
 * Without this a failed request renders nothing at all: `data` is `undefined`,
 * so the `data?.length === 0` empty-state check is falsy and the page falls
 * through to mapping an absent array — a silent blank screen.
 */
export function ErrorState({ subject, onRetry, className }: ErrorStateProps) {
  return (
    <EmptyState
      className={className}
      icon={<AlertTriangle className="h-5 w-5" />}
      title={`Couldn't load ${subject}`}
      description="The archive didn't respond. You may need to sign in, or the API may be unreachable."
      action={
        onRetry ? (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        ) : undefined
      }
    />
  );
}
