import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const Scene6: React.FC = () => {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 600);
    const t2 = setTimeout(() => setPhase(2), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center overflow-hidden z-10 px-16"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: 100 }}
      transition={{ duration: 0.8 }}
    >
      <motion.img 
        src={`${import.meta.env.BASE_URL}images/elearning.jpg`}
        alt="eLearning & Security"
        className="absolute inset-0 w-full h-full object-cover opacity-25 mix-blend-screen"
        initial={{ scale: 1.1, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 5, ease: "easeOut" }}
      />
      <div className="absolute inset-0 bg-gradient-to-l from-[hsl(var(--background))] via-[hsl(var(--background))/90] to-transparent" />

      <div className="relative z-10 w-full max-w-7xl mx-auto flex gap-12 flex-row-reverse items-center">
        <div className="flex-1 flex flex-col justify-center items-start text-left">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-block px-4 py-1.5 rounded-full border border-[hsl(var(--brand-teal))]/30 bg-[hsl(var(--brand-teal))]/10 text-[hsl(var(--brand-teal))] font-medium text-sm mb-6 uppercase tracking-wider">
              Digital & Physical Safety
            </div>
            <h2 className="text-5xl md:text-6xl font-bold text-white font-display leading-tight mb-6">
              eLearning &<br/>
              <span className="text-[hsl(var(--brand-teal))]">Campus Security</span>
            </h2>
            <p className="text-xl text-white/70 max-w-md">
              Secure digital classrooms integrated with physical school security systems.
            </p>
          </motion.div>
        </div>

        <div className="flex-1 relative flex justify-center">
          <motion.div 
            className="w-80 h-80 relative"
            initial={{ opacity: 0, scale: 0.8, rotateY: -30 }}
            animate={phase >= 1 ? { opacity: 1, scale: 1, rotateY: 0 } : { opacity: 0, scale: 0.8, rotateY: -30 }}
            transition={{ duration: 1, type: "spring", stiffness: 100 }}
            style={{ perspective: 1000 }}
          >
            <div className="absolute inset-0 rounded-full border border-[hsl(var(--brand-teal))]/30 animate-[spin_10s_linear_infinite]" />
            <div className="absolute inset-4 rounded-full border border-[hsl(var(--brand-gold))]/30 animate-[spin_15s_linear_infinite_reverse]" />
            
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-24 h-24 text-[hsl(var(--brand-teal))]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default Scene6;