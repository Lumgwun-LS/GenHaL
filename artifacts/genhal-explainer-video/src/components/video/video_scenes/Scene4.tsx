import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function Scene4() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1000);
    const t2 = setTimeout(() => setPhase(2), 2500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {/* Background flowing characters (abstract representation of language) */}
      <div className="absolute inset-0 overflow-hidden opacity-[0.03] pointer-events-none font-display text-[8vh] leading-none text-[#F5F5F0] flex flex-wrap content-start break-all break-words">
        {Array.from({ length: 400 }).map((_, i) => (
          <motion.span
            key={i}
            initial={{ opacity: Math.random() }}
            animate={{ opacity: [Math.random(), Math.random(), Math.random()] }}
            transition={{ duration: 3 + Math.random() * 4, repeat: Infinity }}
          >
            {String.fromCharCode(0x1300 + Math.random() * 200)}
          </motion.span>
        ))}
      </div>

      <div className="relative z-10 w-full flex text-left px-[10vw]">
        <div className="w-1/2">
          <motion.div
            className="w-[10vw] h-[2px] bg-[#A8360F] mb-[4vh]"
            initial={{ scaleX: 0, originX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
          <motion.h2
            className="font-display text-[7vh] text-[#F5F5F0] leading-[1.1] mb-[3vh]"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            Language<br />Preservation
          </motion.h2>

          <motion.p
            className="text-[3vh] text-[#F5F5F0]/70 font-body font-light max-w-[30vw]"
            initial={{ opacity: 0 }}
            animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
            transition={{ duration: 1 }}
          >
            Protecting indigenous languages like <span className="text-[#A8360F] font-medium">Obolo</span> from extinction.
          </motion.p>
        </div>

        <div className="w-1/2 flex items-center justify-end">
          <motion.div
            className="relative w-[30vw] h-[30vw] border border-[#A8360F]/30 rounded-full flex items-center justify-center bg-glass"
            initial={{ scale: 0, rotate: -90 }}
            animate={phase >= 2 ? { scale: 1, rotate: 0 } : { scale: 0, rotate: -90 }}
            transition={{ duration: 1.5, type: 'spring', bounce: 0.3 }}
          >
            <div className="absolute inset-2 border border-[#A8360F]/10 rounded-full border-dashed animate-[spin_20s_linear_infinite]" />
            <div className="absolute inset-8 border border-[#96560F]/20 rounded-full animate-[spin_15s_linear_infinite_reverse]" />
            
            <div className="text-center">
              <div className="text-[#96560F] font-display text-[4vh] mb-1">AI</div>
              <div className="text-[#F5F5F0]/60 font-body text-[1.5vh] uppercase tracking-widest">Training Data</div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}