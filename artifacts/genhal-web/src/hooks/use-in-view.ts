import { useEffect, useRef, useState } from 'react';

interface UseInViewOptions {
  /** Stop observing after the first reveal. Defaults to true. */
  once?: boolean;
  /** Fraction of the element that must be visible. Defaults to 0.05. */
  threshold?: number;
  /** Shrinks the viewport so elements reveal slightly before the edge. */
  rootMargin?: string;
}

/**
 * Reports whether the referenced element has entered the viewport.
 *
 * Elements already on screen at mount resolve on the observer's first
 * callback, so this drives both first-paint stagger and scroll reveals.
 * Falls back to "visible" when IntersectionObserver is unavailable or the
 * user asked for reduced motion, so content is never left hidden.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>({
  once = true,
  threshold = 0.05,
  rootMargin = '0px 0px -8% 0px',
}: UseInViewOptions = {}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prefersReducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion || typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
            if (once) observer.disconnect();
          } else if (!once) {
            setInView(false);
          }
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once, threshold, rootMargin]);

  return { ref, inView };
}
