import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useThemeStore } from "@/store/themeStore";

interface AnimatedCardProps {
  children: React.ReactNode;
  /** Override the theme's default entry animation */
  animation?: string;
  /** Stagger delay in ms (multiples of 80ms recommended) */
  delay?: number;
  /** Animation duration in ms */
  duration?: number;
  className?: string;
  /** IntersectionObserver-based trigger — false = animate on mount */
  scrollTrigger?: boolean;
}

export function AnimatedCard({
  children,
  animation,
  delay = 0,
  duration = 680,
  className,
  scrollTrigger = true,
}: AnimatedCardProps) {
  const { config } = useThemeStore();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (!scrollTrigger) {
      const t = setTimeout(() => setVisible(true), 16);
      return () => clearTimeout(t);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
      },
      { threshold: 0.05 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [scrollTrigger]);

  const anim = animation ?? config.entryAnimation;

  return (
    <div
      ref={ref}
      className={cn(className)}
      style={visible
        ? { animation: `${anim} ${duration}ms cubic-bezier(0.34,1.4,0.64,1) ${delay}ms both` }
        : { opacity: 0 }}
    >
      {children}
    </div>
  );
}
