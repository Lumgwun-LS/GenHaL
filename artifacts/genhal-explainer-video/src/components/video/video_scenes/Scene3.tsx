import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function Scene3() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1200);
    const t2 = setTimeout(() => setPhase(2), 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center">
      {/* Concentric rings representing oral history / community ripples */}
      <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
        {[1, 2, 3, 4].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border border-[#96560F]"
            initial={{ width: 0, height: 0, opacity: 1 }}
            animate={{ width: `${i * 30}vw`, height: `${i * 30}vw`, opacity: 0 }}
            transition={{
              duration: 6,
              repeat: Infinity,
              delay: i * 1.5,
              ease: "linear"
            }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full flex flex-col items-center text-center">
        <motion.p
          className="text-[#96560F] text-[2.5vh] uppercase tracking-[0.3em] font-body mb-[2vh]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, scale: 1.1 }}
          transition={{ duration: 0.8 }}
        >
          Heritage Hub
        </motion.p>
        
        <motion.h2
          className="font-display text-[7vh] text-[#F5F5F0] leading-[1.1] mb-[4vh]"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, filter: 'blur(10px)' }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          Community Stories &<br />Oral Histories
        </motion.h2>

        <div className="flex gap-[4vw] mt-[2vh] font-body text-[2.5vh] text-[#F5F5F0]/60">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
            transition={{ duration: 0.8 }}
          >
            Cultural Traditions
          </motion.div>
          <motion.div
            className="w-[1px] h-[3vh] bg-[#96560F]/50"
            initial={{ height: 0 }}
            animate={phase >= 1 ? { height: '3vh' } : { height: 0 }}
          />
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 20 }}
            transition={{ duration: 0.8 }}
          >
            Ancestral Wisdom
          </motion.div>
        </div>
      </div>
    </div>
  );
}