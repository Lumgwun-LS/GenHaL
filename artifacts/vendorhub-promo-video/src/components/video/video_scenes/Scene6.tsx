import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export const Scene6 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2200),
      setTimeout(() => setPhase(4), 5800), // swap to ecosystem line
      setTimeout(() => setPhase(5), 10200), // Exit
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
          phase >= 5 ? { scale: 1.3, opacity: 0 } :
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
      <div className="relative z-10 flex flex-col items-center text-center max-w-[60vw] px-[2vw]">
        <motion.div
          className="w-[5vw] h-[5vw] rounded-full bg-gradient-to-r from-primary to-accent mb-[2vw] flex items-center justify-center shadow-[0_0_2vw_rgba(127,80,255,0.8)] relative"
          initial={{ scale: 0, rotate: -180 }}
          animate={
            phase >= 5 ? { scale: 0, rotate: 180 } :
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
          <div className="w-[2vw] h-[2vw] rounded-[0.5vw] bg-white rotate-45" />
        </motion.div>

        <div className="overflow-hidden mb-[1vw] w-full text-center">
          <motion.h2
            className="text-[4.2vw] font-display font-bold text-white tracking-tight"
            initial={{ y: 120 }}
            animate={
              phase >= 5 ? { y: -120 } :
              phase >= 2 ? { y: 0 } :
              { y: 120 }
            }
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            Powered by Awajimaa <span className="text-gradient-mixed italic">AI.</span>
          </motion.h2>
        </div>

        <div className="relative w-full flex items-center justify-center min-h-[3.5vw]">
          <AnimatePresence mode="wait">
            {phase === 3 && (
              <motion.p
                key="subtext-1"
                className="text-[1.5vw] text-text-secondary max-w-[40vw] mx-auto"
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -30, opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                Awajimaa AI connects the dots. Generating insights, automating logistics, and driving growth across every app.
              </motion.p>
            )}
            {phase === 4 && (
              <motion.p
                key="subtext-2"
                className="text-[1.3vw] leading-relaxed text-text-secondary max-w-[46vw] mx-auto"
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -30, opacity: 0 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                The Awajimaa AI is a core part of the Unified Civictech, Fintech &amp; Super App called the{' '}
                <span className="text-white font-semibold">Awajimaa App</span> — an intelligent platform for
                reporting and responding to emergencies, commerce, and education. The WeChat of Africa, and the
                digital infrastructure that will power states and organizations across Africa and beyond.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
};
