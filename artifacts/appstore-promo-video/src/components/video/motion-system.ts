export const transitions = {
  slowReveal: { duration: 1.5, ease: [0.16, 1, 0.3, 1] },
  snappy: { type: "spring", stiffness: 400, damping: 30 },
  bouncy: { type: "spring", stiffness: 300, damping: 15 },
  smooth: { type: "spring", stiffness: 120, damping: 25 },
};

export const variants = {
  fadeInUp: {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0, transition: transitions.slowReveal },
    exit: { opacity: 0, y: -20, transition: { duration: 0.5 } }
  },
  staggerContainer: {
    animate: { transition: { staggerChildren: 0.1 } }
  },
  clipReveal: {
    initial: { clipPath: "polygon(0 100%, 100% 100%, 100% 100%, 0% 100%)" },
    animate: { clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)", transition: transitions.slowReveal },
    exit: { clipPath: "polygon(0 0, 100% 0, 100% 0, 0 0)", transition: { duration: 0.5 } }
  }
};