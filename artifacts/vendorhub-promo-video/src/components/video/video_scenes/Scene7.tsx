import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export const Scene7 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1500),
      setTimeout(() => setPhase(3), 4000), // Start exit before loop
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-[2vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Background flare */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-tr from-primary/20 via-transparent to-accent/20 mix-blend-screen pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 3 ? 0 : 1 }}
        transition={{ duration: 1 }}
      />

      <div className="relative z-20">
        <div className="overflow-hidden mb-[1.5vw]">
          <motion.h2
            className="text-[6vw] font-display font-black text-white tracking-tighter"
            initial={{ y: 150 }}
            animate={
              phase >= 3 ? { y: -150, opacity: 0 } :
              phase >= 1 ? { y: 0, opacity: 1 } :
              { y: 150, opacity: 0 }
            }
            transition={{ duration: 0.9, ease: [0.34, 1.56, 0.64, 1] }}
          >
            Do <span className="text-gradient-mixed">More.</span>
          </motion.h2>
        </div>

        <div className="overflow-hidden h-[4vw]">
          <motion.p
            className="text-[2vw] text-text-secondary font-medium tracking-wide"
            initial={{ y: 50, opacity: 0 }}
            animate={
              phase >= 3 ? { y: 50, opacity: 0 } :
              phase >= 2 ? { y: 0, opacity: 1 } :
              { y: 50, opacity: 0 }
            }
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            Awajimaa handles the rest.
          </motion.p>
        </div>
      </div>

      {/* Decorative accent lines */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-[20%] -left-[10%] w-[120%] h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent opacity-50"
          initial={{ rotate: -5, scaleX: 0 }}
          animate={
            phase >= 3 ? { scaleX: 0, opacity: 0 } :
            phase >= 1 ? { scaleX: 1, opacity: 0.5 } :
            { scaleX: 0, opacity: 0 }
          }
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
        <motion.div
          className="absolute bottom-[20%] -left-[10%] w-[120%] h-[1px] bg-gradient-to-r from-transparent via-accent to-transparent opacity-50"
          initial={{ rotate: 5, scaleX: 0 }}
          animate={
            phase >= 3 ? { scaleX: 0, opacity: 0 } :
            phase >= 2 ? { scaleX: 1, opacity: 0.5 } :
            { scaleX: 0, opacity: 0 }
          }
          transition={{ duration: 1.5, ease: "easeOut" }}
        />
      </div>
    </motion.div>
  );
};
