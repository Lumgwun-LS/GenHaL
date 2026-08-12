import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function Scene6() {
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
      {/* Abstract pillars / compound structures */}
      <div className="absolute bottom-0 w-full h-[60vh] flex items-end justify-between px-[5vw] opacity-10 pointer-events-none">
        {[1, 2, 3, 4, 5].map((i) => (
          <motion.div
            key={i}
            className="w-[12vw] bg-[#8F2A08]"
            initial={{ height: 0 }}
            animate={{ height: `${20 + Math.random() * 40}vh` }}
            transition={{ duration: 2, delay: i * 0.2, ease: "easeOut" }}
          />
        ))}
      </div>

      <div className="relative z-10 w-full flex flex-col items-center text-center">
        <motion.h2
          className="font-display text-[7vh] text-[#F5F5F0] leading-[1.1] mb-[6vh]"
          initial={{ opacity: 0, scale: 1.1 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, y: -50 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          Kingdom & Town<br />Governance
        </motion.h2>

        <div className="flex gap-[6vw]">
          {[
            { title: 'Civic Records', icon: 'M4 4h16v16H4z M4 9h16 M4 14h16 M9 4v16' },
            { title: 'Compound History', icon: 'M12 2L2 22h20L12 2z M12 8l-6 10h12z' },
            { title: 'Chiefs & Royals', icon: 'M2 20h20 M5 20V5l5 5 2-8 2 8 5-5v15' }
          ].map((item, i) => (
            <motion.div
              key={i}
              className="flex flex-col items-center"
              initial={{ opacity: 0, y: 30 }}
              animate={phase >= (i === 0 ? 0 : i === 1 ? 1 : 2) ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
              transition={{ duration: 0.8 }}
            >
              <div className="w-[12vh] h-[12vh] rounded-full bg-[#8F2A08]/10 border border-[#8F2A08]/30 flex items-center justify-center mb-[2vh]">
                <svg className="w-[5vh] h-[5vh] stroke-[#A8360F]" fill="none" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                </svg>
              </div>
              <p className="text-[2vh] text-[#F5F5F0]/80 font-body uppercase tracking-wider">{item.title}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}