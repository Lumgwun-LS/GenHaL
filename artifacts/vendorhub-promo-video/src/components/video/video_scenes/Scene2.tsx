import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export const Scene2 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 4800), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-row items-center justify-between px-[10vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, y: -100, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Visual Composition - Left side */}
      <div className="relative w-[40vw] h-[60vh] flex items-center justify-center pointer-events-none">
        <motion.div
          className="absolute inset-0 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(255,127,80,0.3)] border border-white/10"
          initial={{ scale: 0.8, opacity: 0, rotateY: -20, rotateX: 10 }}
          animate={
            phase >= 4 ? { scale: 1.2, opacity: 0, x: -200 } :
            phase >= 1 ? { scale: 1, opacity: 1, rotateY: 5, rotateX: 5 } :
            { scale: 0.8, opacity: 0, rotateY: -20, rotateX: 10 }
          }
          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformPerspective: 1000 }}
        >
          <img 
            src={`${import.meta.env.BASE_URL}images/drone-emergency.jpg`} 
            alt="Emergency Drone" 
            className="w-full h-full object-cover object-center mix-blend-lighten opacity-80"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-bg-dark/80 via-transparent to-transparent" />
        </motion.div>

        {/* Radar Ping UI */}
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
        >
           <motion.div 
             className="w-32 h-32 rounded-full border border-accent/60 absolute"
             animate={{ scale: [1, 3], opacity: [1, 0] }}
             transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
           />
           <motion.div 
             className="w-32 h-32 rounded-full border border-accent/40 absolute"
             animate={{ scale: [1, 3], opacity: [1, 0] }}
             transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 1 }}
           />
           <div className="w-4 h-4 bg-accent rounded-full" />
        </motion.div>

        <motion.div
          className="absolute -right-8 top-[30%] bg-bg-muted/90 backdrop-blur-xl border border-white/10 rounded-xl p-4 shadow-xl"
          initial={{ x: 50, opacity: 0, scale: 0.9 }}
          animate={
            phase >= 4 ? { x: 100, opacity: 0 } :
            phase >= 3 ? { x: 0, opacity: 1, scale: 1 } :
            { x: 50, opacity: 0, scale: 0.9 }
          }
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: phase === 3 ? 0.2 : 0 }}
        >
          <p className="text-accent text-xs font-bold mb-1 uppercase tracking-wider">Deploying</p>
          <p className="text-white text-sm font-medium">Emergency Drone Team</p>
        </motion.div>
      </div>

      {/* Right Content */}
      <div className="max-w-xl relative z-20 text-right">
        <div className="overflow-hidden mb-4 flex justify-end">
          <motion.p
            className="text-primary font-bold tracking-widest uppercase text-lg"
            initial={{ y: 50, opacity: 0 }}
            animate={
              phase >= 4 ? { y: -30, opacity: 0 } :
              phase >= 1 ? { y: 0, opacity: 1 } :
              { y: 50, opacity: 0 }
            }
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            Awajimaa App
          </motion.p>
        </div>
        
        <div className="overflow-hidden mb-6 flex justify-end">
          <motion.h2
            className="text-6xl md:text-7xl font-display font-bold text-white leading-tight"
            initial={{ y: 100, opacity: 0 }}
            animate={
              phase >= 4 ? { y: -50, opacity: 0 } :
              phase >= 2 ? { y: 0, opacity: 1 } :
              { y: 100, opacity: 0 }
            }
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            Emergency<br/>
            <span className="text-gradient-accent">Response.</span>
          </motion.h2>
        </div>

        <motion.p
          className="text-2xl text-text-secondary ml-auto"
          initial={{ opacity: 0, y: 20 }}
          animate={
            phase >= 4 ? { opacity: 0, y: -20 } :
            phase >= 3 ? { opacity: 1, y: 0 } :
            { opacity: 0, y: 20 }
          }
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Rapid deployment for oil spillage and medical crises. Connecting patients with ambulances and hospitals instantly.
        </motion.p>
      </div>
    </motion.div>
  );
};
