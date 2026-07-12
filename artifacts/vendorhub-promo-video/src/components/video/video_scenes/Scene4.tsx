import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export const Scene4 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 4800), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 pl-[10vw] flex flex-row items-center justify-between"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -100, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Left Content */}
      <div className="max-w-2xl relative z-20">
        <motion.div
          className="w-16 h-16 rounded-2xl bg-bg-muted border border-accent/30 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(255,127,80,0.4)]"
          initial={{ scale: 0, rotate: -90 }}
          animate={
            phase >= 4 ? { scale: 0, rotate: 90 } :
            phase >= 1 ? { scale: 1, rotate: 0 } :
            { scale: 0, rotate: -90 }
          }
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <div className="w-8 h-8 flex flex-wrap gap-1">
             <div className="w-[14px] h-[14px] bg-accent rounded-sm" />
             <div className="w-[14px] h-[14px] bg-primary rounded-sm" />
             <div className="w-[14px] h-[14px] bg-primary rounded-sm" />
             <div className="w-[14px] h-[14px] bg-accent rounded-sm" />
          </div>
        </motion.div>

        <div className="overflow-hidden mb-2">
          <motion.p
            className="text-primary font-bold tracking-widest uppercase text-lg"
            initial={{ y: 50, opacity: 0 }}
            animate={
              phase >= 4 ? { y: -30, opacity: 0 } :
              phase >= 1 ? { y: 0, opacity: 1 } :
              { y: 50, opacity: 0 }
            }
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            Awa Hub App
          </motion.p>
        </div>

        <div className="overflow-hidden mb-6">
          <motion.h2
            className="text-6xl md:text-7xl font-display font-bold text-white leading-tight"
            initial={{ y: 100, opacity: 0 }}
            animate={
              phase >= 4 ? { y: -50, opacity: 0 } :
              phase >= 2 ? { y: 0, opacity: 1 } :
              { y: 100, opacity: 0 }
            }
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            Connecting<br/>
            <span className="text-gradient-primary">Markets.</span>
          </motion.h2>
        </div>

        <motion.p
          className="text-2xl text-text-secondary max-w-xl pr-8"
          initial={{ opacity: 0, x: -50 }}
          animate={
            phase >= 4 ? { opacity: 0, x: 50 } :
            phase >= 3 ? { opacity: 1, x: 0 } :
            { opacity: 0, x: -50 }
          }
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          Property listings, multivendor logistics, insurance, and business deals across major markets in Africa and beyond.
        </motion.p>
      </div>

      {/* Right Visuals */}
      <div className="relative w-[50vw] h-full flex items-center justify-center pointer-events-none overflow-hidden">
        {/* Background art */}
        <motion.div
          className="absolute right-0 top-0 bottom-0 w-[60vw] opacity-80 mix-blend-screen"
          initial={{ x: 100, opacity: 0 }}
          animate={
            phase >= 4 ? { scale: 1.2, opacity: 0 } :
            phase >= 1 ? { x: 0, opacity: 1 } :
            { x: 100, opacity: 0 }
          }
          transition={{ duration: 1.5, ease: "easeOut" }}
        >
          <img 
            src={`${import.meta.env.BASE_URL}images/awahub-logistics.jpg`}
            alt="Logistics Network"
            className="w-full h-full object-cover object-left border-l border-white/10"
            style={{ clipPath: 'polygon(20% 0, 100% 0, 100% 100%, 0 100%)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-bg-dark via-bg-dark/50 to-transparent" />
        </motion.div>
        
        {/* Floating stats */}
        <motion.div
          className="absolute left-[10%] bottom-[25%] bg-bg-muted/90 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-2xl z-20"
          initial={{ y: 50, opacity: 0, scale: 0.9 }}
          animate={
            phase >= 4 ? { y: 100, opacity: 0 } :
            phase >= 3 ? { y: 0, opacity: 1, scale: 1 } :
            { y: 50, opacity: 0, scale: 0.9 }
          }
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: phase === 3 ? 0.4 : 0 }}
        >
          <p className="text-text-secondary text-sm font-medium mb-1">Active Deals</p>
          <p className="text-white font-bold text-2xl">4,289</p>
        </motion.div>
      </div>
    </motion.div>
  );
};
