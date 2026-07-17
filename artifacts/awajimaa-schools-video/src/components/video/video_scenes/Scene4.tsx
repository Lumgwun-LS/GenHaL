import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const Scene4: React.FC = () => {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 500);
    const t2 = setTimeout(() => setPhase(2), 1000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center overflow-hidden z-10 px-16"
      initial={{ opacity: 0, clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ opacity: 1, clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="relative z-10 w-full max-w-7xl mx-auto flex gap-12 items-center">
        <div className="flex-1 relative">
          <motion.div 
            className="w-full aspect-square max-w-md mx-auto relative"
            initial={{ opacity: 0, rotate: -10 }}
            animate={phase >= 1 ? { opacity: 1, rotate: 0 } : { opacity: 0, rotate: -10 }}
            transition={{ duration: 1 }}
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-[hsl(var(--brand-teal))] to-[hsl(var(--brand-gold))] rounded-3xl opacity-20 blur-2xl" />
            
            <motion.div 
              className="absolute top-10 left-0 w-64 bg-glass rounded-xl p-5 border border-white/10 backdrop-blur-xl z-20"
              initial={{ x: -50, opacity: 0 }}
              animate={phase >= 2 ? { x: 0, opacity: 1 } : { x: -50, opacity: 0 }}
              transition={{ duration: 0.8, type: "spring" }}
            >
              <div className="text-xs text-white/50 mb-1">Teacher Dashboard</div>
              <div className="text-lg font-bold text-white mb-3">Performance & Payroll</div>
              <div className="h-2 w-full bg-white/10 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-[hsl(var(--brand-teal))]"
                  initial={{ width: 0 }}
                  animate={phase >= 2 ? { width: '85%' } : { width: 0 }}
                  transition={{ duration: 1, delay: 0.5 }}
                />
              </div>
            </motion.div>

            <motion.div 
              className="absolute bottom-10 right-0 w-64 bg-glass rounded-xl p-5 border border-white/10 backdrop-blur-xl z-30"
              initial={{ x: 50, opacity: 0 }}
              animate={phase >= 2 ? { x: 0, opacity: 1 } : { x: 50, opacity: 0 }}
              transition={{ duration: 0.8, delay: 0.2, type: "spring" }}
            >
              <div className="text-xs text-white/50 mb-1">Student Portal</div>
              <div className="text-lg font-bold text-white mb-3">Enrollment Status</div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[hsl(var(--brand-gold))]" />
                <span className="text-sm text-white/80">Active & Enrolled</span>
              </div>
            </motion.div>
          </motion.div>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-5xl md:text-6xl font-bold text-white font-display leading-tight mb-6">
              Empowering<br/>
              <span className="text-[hsl(var(--brand-teal))]">Teachers</span> &<br/>
              <span className="text-[hsl(var(--brand-gold))]">Students</span>
            </h2>
            <p className="text-xl text-white/70 max-w-md">
              From seamless student enrollment to comprehensive teacher performance and payroll management.
            </p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default Scene4;