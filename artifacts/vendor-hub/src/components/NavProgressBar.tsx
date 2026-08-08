import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useThemeStore } from "@/store/themeStore";

type BarState = "idle" | "running" | "done";

export function NavProgressBar() {
  const [location] = useLocation();
  const { config: tc } = useThemeStore();
  const [barState, setBarState] = useState<BarState>("idle");
  const [width, setWidth] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isFirst = useRef(true);

  const clearTimers = () => timers.current.forEach(clearTimeout);

  useEffect(() => {
    if (isFirst.current) { isFirst.current = false; return; }
    clearTimers();
    setWidth(0);
    setBarState("running");

    const t1 = setTimeout(() => setWidth(65), 30);
    const t2 = setTimeout(() => setWidth(85), 380);
    const t3 = setTimeout(() => setWidth(100), 680);
    const t4 = setTimeout(() => setBarState("done"), 900);
    const t5 = setTimeout(() => { setBarState("idle"); setWidth(0); }, 1250);

    timers.current = [t1, t2, t3, t4, t5];
    return clearTimers;
  }, [location]);

  if (barState === "idle") return null;

  const opacity = barState === "done" ? 0 : 1;
  const duration = barState === "done" ? "350ms" : width < 50 ? "250ms" : "550ms";

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[3px] overflow-visible pointer-events-none"
      style={{ transition: `opacity 350ms ease`, opacity }}
    >
      {/* Main bar */}
      <div
        className="absolute top-0 left-0 h-full"
        style={{
          width: `${width}%`,
          background: tc.accentGradient,
          boxShadow: `0 0 10px ${tc.accentColor}cc, 0 0 20px ${tc.accentColor}55, 0 0 40px ${tc.accentColor}22`,
          transition: `width ${duration} cubic-bezier(0.4,0,0.2,1)`,
        }}
      >
        {/* Shimmer sweep */}
        <div
          className="absolute inset-0 nav-bar-shimmer"
          style={{
            background: `linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)`,
          }}
        />

        {/* Leading glow orb */}
        <div
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 rounded-full nav-orb-pulse"
          style={{
            width: 10,
            height: 10,
            background: "white",
            boxShadow: `0 0 6px 3px ${tc.accentColor}, 0 0 14px 6px ${tc.accentColor}60`,
          }}
        />

        {/* Sparkle particles burst from the leading edge */}
        <div className="absolute right-0 top-0 nav-sparkle-cluster">
          {[
            { tx: "-10px", ty: "-14px", size: 4, delay: "0s" },
            { tx: "8px",  ty: "-12px", size: 3, delay: "0.08s" },
            { tx: "-5px", ty: "-18px", size: 5, delay: "0.04s" },
            { tx: "12px", ty: "-8px",  size: 3, delay: "0.12s" },
            { tx: "-14px",ty: "-8px",  size: 3, delay: "0.16s" },
          ].map((p, i) => (
            <div
              key={i}
              className="absolute nav-sparkle-dot"
              style={{
                width: p.size,
                height: p.size,
                borderRadius: "50%",
                background: tc.accentColor,
                boxShadow: `0 0 4px ${tc.accentColor}`,
                "--tx": p.tx,
                "--ty": p.ty,
                animationDelay: p.delay,
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>

      {/* Background glow track */}
      <div
        className="absolute top-0 left-0 h-full opacity-20"
        style={{
          width: `${width}%`,
          background: tc.accentColor,
          filter: "blur(3px)",
          transition: `width ${duration} cubic-bezier(0.4,0,0.2,1)`,
        }}
      />
    </div>
  );
}
