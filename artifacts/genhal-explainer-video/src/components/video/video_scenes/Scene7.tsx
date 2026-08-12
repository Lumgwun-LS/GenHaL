import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function Scene7() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1500);
    return () => clearTimeout(t1);
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-[#0F0A08] z-20">
      <div className="text-center w-full flex flex-col items-center">
        <motion.p
          className="font-body font-light text-[3vh] text-[#F5F5F0]/60 tracking-[0.2em] uppercase mb-[4vh]"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
        >
          Preserve your legacy.
        </motion.p>

        <motion.div
          className="font-display text-[12vh] tracking-widest uppercase flex"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="text-[#F5F5F0]">Gen</span>
          <span className="text-[#8F2A08]">HaL</span>
        </motion.div>

        <motion.p
          className="text-[#96560F] text-[2.5vh] mt-[4vh] font-body tracking-[0.3em] uppercase"
          initial={{ opacity: 0 }}
          animate={phase >= 1 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          Forever.
        </motion.p>
      </div>
    </div>
  );
}