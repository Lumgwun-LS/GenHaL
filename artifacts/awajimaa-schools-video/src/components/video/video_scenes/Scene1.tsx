import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const Scene1: React.FC = () => {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <motion.div 
        className="absolute w-[120vw] h-[120vh] rounded-full border border-white/5 pointer-events-none"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, rotate: 45 }}
        transition={{ duration: 3, ease: "easeOut" }}
      />
      <motion.div 
        className="absolute w-[80vw] h-[80vh] rounded-full border border-[hsl(var(--brand-teal))]/20 pointer-events-none"
        initial={{ scale: 0.2, opacity: 0 }}
        animate={{ scale: 1, opacity: 1, rotate: -45 }}
        transition={{ duration: 3.5, ease: "easeOut" }}
      />
      
      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-4 mb-6"
        >
          <div className="w-12 h-12 bg-gold-gradient rounded-lg rotate-45 flex items-center justify-center">
            <div className="w-6 h-6 bg-[hsl(var(--background))] rounded -rotate-45" />
          </div>
          <h1 className="text-6xl md:text-7xl font-bold tracking-tight text-white font-display">
            Awajimaa <span className="text-[hsl(var(--brand-teal))] font-light">Schools</span>
          </h1>
        </motion.div>
        
        <div className="h-[2px] bg-white/10 w-full max-w-md my-4 relative overflow-hidden">
          <motion.div 
            className="absolute top-0 left-0 h-full w-1/3 bg-[hsl(var(--brand-gold))]"
            initial={{ x: '-100%' }}
            animate={phase >= 1 ? { x: '300%' } : { x: '-100%' }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
          />
        </div>
        
        <motion.p
          className="text-2xl md:text-3xl font-light text-white/70 tracking-wide mt-4"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          Powering Education Across <span className="text-[hsl(var(--brand-gold))] font-medium">Africa</span>
        </motion.p>
      </div>
    </motion.div>
  );
};

export default Scene1;