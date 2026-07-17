import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const Scene5: React.FC = () => {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 500);
    const t2 = setTimeout(() => setPhase(2), 1200);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center overflow-hidden z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, filter: 'blur(10px)' }}
      transition={{ duration: 0.8 }}
    >
      <motion.img 
        src={`${import.meta.env.BASE_URL}images/community.jpg`}
        alt="Community"
        className="absolute inset-0 w-full h-full object-cover opacity-40 mix-blend-screen"
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 5, ease: "easeOut" }}
      />
      <div className="absolute inset-0 bg-[hsl(var(--background))]/60" />

      <div className="relative z-10 w-full max-w-5xl mx-auto text-center px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-5xl md:text-7xl font-bold text-white font-display mb-6">
            Connecting <span className="text-[hsl(var(--brand-gold))]">Sponsors</span><br/>
            & <span className="text-[hsl(var(--brand-teal))]">Parents</span>
          </h2>
          <p className="text-xl text-white/70 max-w-2xl mx-auto mb-12">
            Transparent communication portals bridging the gap between school and home.
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-6">
          {[
            { icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z", label: "Parent Portals" },
            { icon: "M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z", label: "Direct Comms" },
            { icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", label: "Sponsor Visibility" }
          ].map((item, i) => (
            <motion.div
              key={i}
              className="bg-glass border border-white/10 p-6 rounded-2xl flex flex-col items-center min-w-[200px]"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.5, delay: i * 0.15, type: "spring" }}
            >
              <svg className="w-8 h-8 text-[hsl(var(--brand-gold))] mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
              </svg>
              <span className="text-white font-medium">{item.label}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};

export default Scene5;