import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene3BizDeals() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1200);
    const t2 = setTimeout(() => setPhase(2), 2200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex z-10 overflow-hidden bg-background"
      initial={{ scale: 1.1, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* Background Video */}
      <motion.div 
        className="absolute inset-0 w-full h-full z-0"
        initial={{ filter: 'brightness(0.3) contrast(1.2)' }}
        animate={{ filter: 'brightness(0.5) contrast(1.1)' }}
        transition={{ duration: 5.5 }}
      >
        <video
          src={`${import.meta.env.BASE_URL}videos/deals.mp4`}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
        {/* Deep split overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent w-2/3" />
      </motion.div>

      <div className="relative z-10 w-full h-full flex items-center px-16 md:px-24">
        
        <div className="max-w-2xl">
          <motion.div 
            className="inline-block px-4 py-2 rounded-full border border-primary/30 bg-primary/10 backdrop-blur-md mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <span className="font-outfit font-bold text-primary tracking-widest uppercase text-xs">Structured Biz Deals</span>
          </motion.div>

          <motion.h2 
            className="font-outfit text-5xl md:text-7xl font-bold text-white leading-[1.1] mb-8"
            initial={{ opacity: 0, x: -40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            Partnerships that<br />
            <span className="text-white">drive </span>
            <span className="text-gradient">growth</span>
          </motion.h2>

          {/* Abstract deal connection graphic */}
          <motion.div 
            className="relative w-full h-32 mb-8 flex items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
          >
            {/* Left Node */}
            <motion.div 
              className="w-16 h-16 rounded-full bg-secondary border-2 border-primary/50 flex items-center justify-center z-10 relative shadow-[0_0_30px_hsl(var(--primary)/0.3)]"
              initial={{ scale: 0 }}
              animate={phase >= 1 ? { scale: 1 } : { scale: 0 }}
              transition={{ type: "spring", bounce: 0.5 }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            </motion.div>

            {/* Connecting Line */}
            <div className="flex-1 h-1 bg-white/10 relative overflow-hidden">
              <motion.div 
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary to-accent"
                initial={{ width: '0%' }}
                animate={phase >= 1 ? { width: '100%' } : { width: '0%' }}
                transition={{ duration: 1, delay: 0.2, ease: "easeInOut" }}
              />
            </div>

            {/* Right Node */}
            <motion.div 
              className="w-16 h-16 rounded-full bg-secondary border-2 border-accent/50 flex items-center justify-center z-10 relative shadow-[0_0_30px_hsl(var(--accent)/0.3)]"
              initial={{ scale: 0 }}
              animate={phase >= 2 ? { scale: 1 } : { scale: 0 }}
              transition={{ type: "spring", bounce: 0.5 }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--accent))" strokeWidth="2"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </motion.div>
          </motion.div>

          <motion.p
            className="text-lg text-foreground/80 font-light"
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.8 }}
          >
            Discover verified investment opportunities and structure B2B deals securely on the platform.
          </motion.p>
        </div>
      </div>
    </motion.div>
  );
}