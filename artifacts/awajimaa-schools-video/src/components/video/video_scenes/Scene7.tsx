import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const Scene7: React.FC = () => {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 500);
    const t2 = setTimeout(() => setPhase(2), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden z-10"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.8 }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-[hsl(var(--background))] via-[hsl(var(--brand-navy))] to-[hsl(var(--background))]" />
      
      {/* Decorative floating elements */}
      <motion.div 
        className="absolute top-1/4 left-1/4 w-64 h-64 bg-[hsl(var(--brand-gold))]/5 rounded-full blur-3xl"
        animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />
      
      <div className="relative z-10 text-center px-8">
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="inline-block mb-6">
            <svg className="w-16 h-16 text-[hsl(var(--brand-gold))] mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l9-5-9-5-9 5 9 5zm0 0v6" />
            </svg>
          </div>
          <h2 className="text-5xl md:text-7xl font-bold text-white font-display leading-tight mb-4">
            Scholarships & <span className="text-[hsl(var(--brand-gold))]">Bursaries</span>
          </h2>
          <p className="text-2xl text-white/70 max-w-2xl mx-auto font-light">
            Empowering merit. Unlocking opportunity.
          </p>
        </motion.div>

        <motion.div 
          className="mt-12 w-full max-w-sm mx-auto h-1 bg-white/10 rounded-full overflow-hidden"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
        >
          <motion.div 
            className="h-full bg-gradient-to-r from-[hsl(var(--brand-teal))] to-[hsl(var(--brand-gold))]"
            initial={{ width: 0 }}
            animate={phase >= 1 ? { width: '100%' } : { width: 0 }}
            transition={{ duration: 1.5, delay: 0.5, ease: "easeOut" }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Scene7;