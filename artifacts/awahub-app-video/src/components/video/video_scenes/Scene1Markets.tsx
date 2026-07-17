import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1Markets() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 1600);
    const t3 = setTimeout(() => setPhase(3), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex z-10 overflow-hidden bg-background"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, x: '-10%', filter: 'blur(10px)' }}
      transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* Background Video */}
      <motion.div 
        className="absolute inset-0 w-full h-full z-0"
        initial={{ scale: 1.1, filter: 'brightness(0.4) saturate(0.8)' }}
        animate={{ scale: 1, filter: 'brightness(0.6) saturate(1.2)' }}
        transition={{ duration: 6, ease: "easeOut" }}
      >
        <video
          src={`${import.meta.env.BASE_URL}videos/market.mp4`}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/80 to-transparent" />
      </motion.div>

      <div className="relative z-10 w-full h-full flex flex-col justify-center px-16 md:px-24">
        <div className="max-w-2xl">
          <motion.div 
            className="flex items-center gap-4 mb-6"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <div className="h-px w-12 bg-primary" />
            <span className="font-outfit font-bold text-primary tracking-widest uppercase text-sm">Commerce at Scale</span>
          </motion.div>

          <motion.h2 
            className="font-outfit text-5xl md:text-7xl font-bold text-white leading-[1.1] mb-8"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            Connect across<br />
            <span className="text-gradient">African Markets</span>
          </motion.h2>

          <div className="space-y-6">
            <motion.div 
              className="glass-panel p-5 rounded-2xl flex items-start gap-4 max-w-md transform origin-left"
              initial={{ opacity: 0, rotateX: 45, y: 20 }}
              animate={phase >= 1 ? { opacity: 1, rotateX: 0, y: 0 } : { opacity: 0, rotateX: 45, y: 20 }}
              transition={{ duration: 0.8, type: "spring", stiffness: 100, damping: 20 }}
            >
              <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <div>
                <h4 className="font-outfit font-semibold text-lg text-white mb-1">Global Buyers & Sellers</h4>
                <p className="text-foreground/70 text-sm leading-relaxed">Reach millions of potential partners across borders.</p>
              </div>
            </motion.div>

            <motion.div 
              className="glass-panel p-5 rounded-2xl flex items-start gap-4 max-w-md transform origin-left"
              initial={{ opacity: 0, rotateX: 45, y: 20 }}
              animate={phase >= 2 ? { opacity: 1, rotateX: 0, y: 0 } : { opacity: 0, rotateX: 45, y: 20 }}
              transition={{ duration: 0.8, type: "spring", stiffness: 100, damping: 20 }}
            >
              <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--accent))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
              </div>
              <div>
                <h4 className="font-outfit font-semibold text-lg text-white mb-1">Secure Transactions</h4>
                <p className="text-foreground/70 text-sm leading-relaxed">Built-in trust for every high-value exchange.</p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}