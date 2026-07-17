import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const Scene2: React.FC = () => {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 500);
    const t2 = setTimeout(() => setPhase(2), 1200);
    const t3 = setTimeout(() => setPhase(3), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center overflow-hidden z-10 px-16"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, x: -100 }}
      transition={{ duration: 0.8 }}
    >
      <motion.img 
        src={`${import.meta.env.BASE_URL}images/dashboard.jpg`}
        alt="Dashboard"
        className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-screen"
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 5, ease: "linear" }}
      />
      <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--background))] via-[hsl(var(--background))/80] to-transparent" />

      <div className="relative z-10 w-full max-w-7xl mx-auto flex gap-12">
        <div className="flex-1 flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-block px-4 py-1.5 rounded-full border border-[hsl(var(--brand-gold))]/30 bg-[hsl(var(--brand-gold))]/10 text-[hsl(var(--brand-gold))] font-medium text-sm mb-6 uppercase tracking-wider">
              State Ministries of Education
            </div>
            <h2 className="text-5xl md:text-6xl font-bold text-white font-display leading-tight mb-6">
              Total State-Level<br/>
              <span className="text-[hsl(var(--brand-teal))]">Oversight</span>
            </h2>
          </motion.div>

          <div className="space-y-4">
            {[
              "Complete schools map & metrics",
              "Academic sessions & curriculum",
              "Direct communications channel"
            ].map((text, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-4"
                initial={{ opacity: 0, x: -20 }}
                animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                transition={{ duration: 0.5, delay: i * 0.15 }}
              >
                <div className="w-2 h-2 rounded-full bg-[hsl(var(--brand-gold))]" />
                <p className="text-xl text-white/80">{text}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="flex-1 relative flex items-center justify-center">
          <motion.div 
            className="w-full h-[60vh] bg-glass rounded-2xl p-6 relative overflow-hidden"
            initial={{ opacity: 0, y: 50, rotateX: 20 }}
            animate={phase >= 2 ? { opacity: 1, y: 0, rotateX: 0 } : { opacity: 0, y: 50, rotateX: 20 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            style={{ perspective: 1000 }}
          >
            <div className="w-full h-8 border-b border-white/10 flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-500/50" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/50" />
              <div className="w-3 h-3 rounded-full bg-green-500/50" />
            </div>
            
            <div className="grid grid-cols-2 gap-4 h-[calc(100%-3rem)]">
              <div className="col-span-2 h-1/2 bg-white/5 rounded-lg overflow-hidden relative">
                <motion.div 
                  className="absolute bottom-0 left-0 w-full bg-[hsl(var(--brand-teal))]/30"
                  initial={{ height: 0 }}
                  animate={phase >= 3 ? { height: '60%' } : { height: 0 }}
                  transition={{ duration: 1.5, ease: "easeOut" }}
                />
                <motion.svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                   <motion.path 
                     d="M0 100 L20 80 L40 90 L60 40 L80 60 L100 20 L100 100 Z" 
                     fill="rgba(0, 128, 128, 0.2)"
                     initial={{ pathLength: 0, opacity: 0 }}
                     animate={phase >= 3 ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 }}
                     transition={{ duration: 1.5, ease: "easeInOut" }}
                   />
                   <motion.path 
                     d="M0 100 L20 80 L40 90 L60 40 L80 60 L100 20" 
                     fill="none"
                     stroke="hsl(var(--brand-teal))"
                     strokeWidth="2"
                     initial={{ pathLength: 0 }}
                     animate={phase >= 3 ? { pathLength: 1 } : { pathLength: 0 }}
                     transition={{ duration: 1.5, ease: "easeInOut" }}
                   />
                </motion.svg>
              </div>
              <div className="bg-white/5 rounded-lg p-4 flex flex-col justify-end">
                <div className="text-[hsl(var(--brand-gold))] text-2xl font-bold">2,450</div>
                <div className="text-white/50 text-xs uppercase tracking-wider">Active Schools</div>
              </div>
              <div className="bg-white/5 rounded-lg p-4 flex flex-col justify-end">
                <div className="text-[hsl(var(--brand-teal))] text-2xl font-bold">1.2M</div>
                <div className="text-white/50 text-xs uppercase tracking-wider">Students Enrolled</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default Scene2;