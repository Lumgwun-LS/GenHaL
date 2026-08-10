import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useInView } from '@/hooks/use-in-view';

export type RevealAnimation =
  | 'fade-up'
  | 'fade-left'
  | 'fade-right'
  | 'zoom'
  | 'bounce-up';

const ANIMATIONS: Record<RevealAnimation, string> = {
  'fade-up': 'awa-fade-in-up',
  'fade-left': 'awa-fade-in-left',
  'fade-right': 'awa-fade-in-right',
  zoom: 'awa-zoom-in',
  'bounce-up': 'awa-bounce-in-up',
};

/** Delays past this many items collapse, so long lists don't crawl in. */
const MAX_STAGGER_STEPS = 6;

/** Per-step stagger in milliseconds. */
export const STAGGER_MS = 60;

/** Stagger delay for item `index`, capped so long lists stay responsive. */
export function stagger(index: number, step = STAGGER_MS) {
  return Math.min(index, MAX_STAGGER_STEPS) * step;
}

interface RevealProps {
  children: ReactNode;
  animation?: RevealAnimation;
  /** Delay in milliseconds before the animation starts. */
  delay?: number;
  className?: string;
}

/**
 * Animates its children in once they scroll into view.
 *
 * Children stay at `opacity-0` until revealed, matching the entrance-animation
 * pattern used across the Awajimaa dashboards. Reduced-motion users skip
 * straight to the visible state — see `useInView`.
 */
export function Reveal({
  children,
  animation = 'fade-up',
  delay = 0,
  className,
}: RevealProps) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={cn(inView ? ANIMATIONS[animation] : 'opacity-0', className)}
      style={inView && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
