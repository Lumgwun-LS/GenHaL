import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export const Scene3 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 4800), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Background Image Layer */}
      <motion.div
        className="absolute inset-0 z-0 overflow-hidden"
        initial={{ scale: 1.2, opacity: 0 }}
        animate={
          phase >= 4 ? { scale: 1.3, opacity: 0 } :
          phase >= 1 ? { scale: 1, opacity: 0.4 } :
          { scale: 1.2, opacity: 0 }
        }
        transition={{ duration: 2, ease: "easeOut" }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/education-platform.jpg`}
          alt="Education Concept"
          className="w-full h-full object-cover mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-bg-dark via-bg-dark/80 to-bg-dark/30" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg-dark via-transparent to-bg-dark" />
      </motion.div>

      {/* Content Container */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-[60vw] px-[2vw]">
        <motion.div
          className="overflow-hidden mb-[1vw]"
          initial={{ y: -50, opacity: 0 }}
          animate={
            phase >= 4 ? { y: -80, opacity: 0 } :
            phase >= 1 ? { y: 0, opacity: 1 } :
            { y: -50, opacity: 0 }
          }
          transition={{ duration: 0.6 }}
        >
          <p className="text-white/80 font-bold tracking-widest uppercase text-[1vw] border border-white/20 px-[1vw] py-[0.25vw] rounded-full bg-white/5 backdrop-blur-sm">
            Awajimaa Schools
          </p>
        </motion.div>

        <div className="overflow-hidden mb-[1.5vw]">
          <motion.h2
            className="text-[5vw] font-display font-bold text-white tracking-tight leading-tight"
            initial={{ y: 120 }}
            animate={
              phase >= 4 ? { y: -120 } :
              phase >= 2 ? { y: 0 } :
              { y: 120 }
            }
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            Empowering <span className="text-gradient-mixed italic">Education.</span>
          </motion.h2>
        </div>

        <div className="overflow-hidden h-[8vw]">
          <motion.p
            className="text-[1.5vw] text-text-secondary max-w-[40vw] mx-auto"
            initial={{ y: 50, opacity: 0 }}
            animate={
              phase >= 4 ? { y: -50, opacity: 0 } :
              phase >= 3 ? { y: 0, opacity: 1 } :
              { y: 50, opacity: 0 }
            }
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            For states and institutions. Manage recruitment, academics, bursaries, fees, and security in one unified platform.
          </motion.p>
        </div>

        {/* Floating Modules */}
        <div className="relative w-full h-[8vw] mt-[2vw] flex justify-center gap-[1.5vw]">
          {["Academics", "Security", "Fees"].map((item, i) => (
            <motion.div
              key={item}
              className="bg-bg-muted/80 backdrop-blur-md border border-white/10 rounded-[1vw] px-[1.5vw] py-[0.8vw] flex items-center shadow-lg h-fit"
              initial={{ y: 50, opacity: 0 }}
              animate={
                phase >= 4 ? { y: 100, opacity: 0 } :
                phase >= 3 ? { y: 0, opacity: 1 } :
                { y: 50, opacity: 0 }
              }
              transition={{ type: "spring", stiffness: 300, damping: 25, delay: phase === 3 ? 0.2 + (i * 0.1) : 0 }}
            >
              <div className="w-[0.5vw] h-[0.5vw] rounded-full bg-primary mr-[0.8vw]" />
              <p className="text-white font-medium text-[1vw]">{item}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
};
