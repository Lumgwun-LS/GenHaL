import { Link } from 'wouter';
import { Compass } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/empty-state';

export default function NotFound() {
  return (
    <EmptyState
      icon={<Compass className="h-5 w-5" />}
      title="404 — page not found"
      description="This page isn't part of the archive. Head back to the dashboard to keep exploring."
      action={
        <Link href="/" className={buttonVariants()}>
          Back to dashboard
        </Link>
      }
    />
  );
}
