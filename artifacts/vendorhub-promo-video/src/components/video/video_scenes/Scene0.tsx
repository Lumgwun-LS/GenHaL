import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export const Scene0 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1800),
      setTimeout(() => setPhase(3), 3200), // Exit choreography
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Central Hub visualization */}
      <div className="relative w-[30vw] h-[30vw] flex items-center justify-center mb-[3vw]">
        {/* Orbiting dots */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={`orbit-${i}`}
            className="absolute rounded-full border border-primary/30"
            style={{
              width: `${(i + 1) * 30}%`,
              height: `${(i + 1) * 30}%`,
            }}
            animate={{
              rotate: 360,
              scale: phase >= 3 ? 2 : 1,
              opacity: phase >= 3 ? 0 : 1,
            }}
            transition={{
              rotate: { duration: 10 + i * 5, repeat: Infinity, ease: "linear" },
              scale: { duration: 0.8, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.8 },
            }}
          >
            <div 
              className="absolute -top-1.5 left-1/2 w-[0.8vw] h-[0.8vw] rounded-full bg-accent shadow-[0_0_0.5vw_var(--color-accent)]"
              style={{ transform: 'translateX(-50%)' }}
            />
          </motion.div>
        ))}

        {/* Core logo */}
        <motion.div
          className="relative z-10 w-[6vw] h-[6vw] rounded-[1vw] overflow-hidden shadow-[0_0_1.5vw_rgba(127,80,255,0.6)]"
          initial={{ scale: 0, rotate: -45 }}
          animate={
            phase >= 3 ? { scale: 5, opacity: 0, rotate: 45 } :
            phase >= 1 ? { scale: 1, rotate: 0 } : 
            { scale: 0, rotate: -45 }
          }
          transition={{ duration: 1, ease: [0.34, 1.56, 0.64, 1] }}
        >
          <img src={`${import.meta.env.BASE_URL}images/awajimaa-logo.jpg`} alt="Awajimaa" className="w-full h-full object-cover" />
        </motion.div>
      </div>

      {/* Typography */}
      <div className="text-center overflow-hidden h-[8vw]">
        <motion.h1
          className="text-[5vw] font-display font-bold tracking-tight text-white mb-[0.5vw]"
          initial={{ y: 100, opacity: 0 }}
          animate={
            phase >= 3 ? { y: -50, opacity: 0, filter: 'blur(5px)' } :
            phase >= 1 ? { y: 0, opacity: 1, filter: 'blur(0px)' } :
            { y: 100, opacity: 0 }
          }
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="text-gradient-primary">Awajimaa</span>
        </motion.h1>
      </div>

      <div className="overflow-hidden h-[4vw]">
        <motion.p
          className="text-[1.5vw] text-text-secondary font-medium tracking-wide"
          initial={{ y: 50, opacity: 0 }}
          animate={
            phase >= 3 ? { y: -30, opacity: 0 } :
            phase >= 2 ? { y: 0, opacity: 1 } :
            { y: 50, opacity: 0 }
          }
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          One Connected Ecosystem.
        </motion.p>
      </div>
    </motion.div>
  );
};
