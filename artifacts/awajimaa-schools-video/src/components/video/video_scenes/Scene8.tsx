import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const Scene8: React.FC = () => {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1000);
    const t2 = setTimeout(() => setPhase(2), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden z-10 bg-[hsl(var(--background))]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 1 }}
    >
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
        <motion.div 
          className="w-[150vw] h-[150vw] rounded-full border-[1px] border-[hsl(var(--brand-teal))]/30"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 3, ease: "easeOut" }}
        />
        <motion.div 
          className="absolute w-[100vw] h-[100vw] rounded-full border-[1px] border-[hsl(var(--brand-gold))]/20"
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 2.5, ease: "easeOut", delay: 0.2 }}
        />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, type: "spring", stiffness: 100 }}
          className="flex items-center gap-4 mb-8"
        >
          <div className="w-16 h-16 bg-gold-gradient rounded-xl rotate-45 flex items-center justify-center">
            <div className="w-8 h-8 bg-[hsl(var(--background))] rounded-sm -rotate-45" />
          </div>
        </motion.div>
        
        <motion.h1 
          className="text-6xl md:text-8xl font-bold tracking-tight text-white font-display mb-4"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.4 }}
        >
          Awajimaa <span className="text-[hsl(var(--brand-teal))] font-light">Schools</span>
        </motion.h1>
        
        <motion.div
          className="overflow-hidden mt-6"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="px-8 py-3 border border-white/20 rounded-full bg-white/5 backdrop-blur-sm text-2xl font-light text-white tracking-widest">
            awajimaaschools.com
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Scene8;