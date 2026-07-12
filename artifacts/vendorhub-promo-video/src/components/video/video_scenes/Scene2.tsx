import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export const Scene2 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setPhase(4), 5000), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Background Image Layer */}
      <motion.div
        className="absolute inset-0 z-0 overflow-hidden"
        initial={{ scale: 1.2, opacity: 0 }}
        animate={
          phase >= 4 ? { scale: 1.3, opacity: 0 } :
          phase >= 1 ? { scale: 1, opacity: 0.6 } :
          { scale: 1.2, opacity: 0 }
        }
        transition={{ duration: 2, ease: "easeOut" }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/ai-marketing.png`}
          alt="AI Concept"
          className="w-full h-full object-cover opacity-50 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg-dark via-bg-dark/80 to-bg-dark/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg-dark via-transparent to-bg-dark" />
      </motion.div>

      {/* Content Container */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-4xl px-8">
        <motion.div
          className="w-20 h-20 rounded-full bg-gradient-to-r from-primary to-accent mb-8 flex items-center justify-center shadow-[0_0_40px_rgba(127,80,255,0.8)] relative"
          initial={{ scale: 0, rotate: -180 }}
          animate={
            phase >= 4 ? { scale: 0, rotate: 180 } :
            phase >= 1 ? { scale: 1, rotate: 0 } :
            { scale: 0, rotate: -180 }
          }
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          {/* Pulsing rings */}
          <motion.div 
            className="absolute inset-0 rounded-full border-2 border-white/50"
            animate={{ scale: [1, 1.5, 2], opacity: [1, 0.5, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
          <motion.div 
            className="absolute inset-0 rounded-full border-2 border-accent/50"
            animate={{ scale: [1, 1.8, 2.5], opacity: [1, 0.3, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: "linear", delay: 0.5 }}
          />
          
          {/* Core shape */}
          <div className="w-8 h-8 rounded-lg bg-white rotate-45" />
        </motion.div>

        <div className="overflow-hidden mb-4">
          <motion.h2
            className="text-6xl md:text-8xl font-display font-bold text-white tracking-tight"
            initial={{ y: 120 }}
            animate={
              phase >= 4 ? { y: -120 } :
              phase >= 2 ? { y: 0 } :
              { y: 120 }
            }
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            AI that <span className="text-gradient-mixed italic">sells.</span>
          </motion.h2>
        </div>

        <div className="overflow-hidden h-24">
          <motion.p
            className="text-2xl md:text-3xl text-text-secondary max-w-2xl mx-auto"
            initial={{ y: 50, opacity: 0 }}
            animate={
              phase >= 4 ? { y: -50, opacity: 0 } :
              phase >= 3 ? { y: 0, opacity: 1 } :
              { y: 50, opacity: 0 }
            }
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            Auto-generate social captions, product descriptions, and promotional content in seconds.
          </motion.p>
        </div>

        {/* Floating UI Elements */}
        <div className="relative w-full h-40 mt-8">
          <motion.div
            className="absolute left-[10%] top-0 bg-bg-muted/80 backdrop-blur-md border border-primary/30 rounded-lg p-3 text-left shadow-lg"
            initial={{ x: -50, y: 50, opacity: 0, rotate: -5 }}
            animate={
              phase >= 4 ? { x: -100, opacity: 0 } :
              phase >= 3 ? { x: 0, y: 0, opacity: 1, rotate: -10 } :
              { x: -50, y: 50, opacity: 0, rotate: -5 }
            }
            transition={{ type: "spring", stiffness: 300, damping: 25, delay: phase === 3 ? 0.2 : 0 }}
          >
            <p className="text-accent text-xs font-bold mb-1">✨ AI Caption</p>
            <p className="text-white text-sm">"Upgrade your setup today..."</p>
          </motion.div>

          <motion.div
            className="absolute right-[15%] top-8 bg-bg-muted/80 backdrop-blur-md border border-accent/30 rounded-lg p-3 text-left shadow-lg"
            initial={{ x: 50, y: 50, opacity: 0, rotate: 5 }}
            animate={
              phase >= 4 ? { x: 100, opacity: 0 } :
              phase >= 3 ? { x: 0, y: 0, opacity: 1, rotate: 12 } :
              { x: 50, y: 50, opacity: 0, rotate: 5 }
            }
            transition={{ type: "spring", stiffness: 300, damping: 25, delay: phase === 3 ? 0.4 : 0 }}
          >
            <p className="text-primary text-xs font-bold mb-1">🎯 Keywords</p>
            <div className="flex gap-2 mt-1">
              <span className="bg-primary/20 text-white text-[10px] px-2 py-1 rounded">#Tech</span>
              <span className="bg-primary/20 text-white text-[10px] px-2 py-1 rounded">#Sale</span>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};
