import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export const Scene3 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1400),
      setTimeout(() => setPhase(3), 2400),
      setTimeout(() => setPhase(4), 4500), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-row items-center justify-between px-[10vw]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: 200, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Left Content */}
      <div className="max-w-2xl relative z-20">
        <motion.div
          className="w-16 h-16 rounded-2xl bg-bg-muted border border-accent/30 flex items-center justify-center mb-8 shadow-[0_0_30px_rgba(255,127,80,0.4)]"
          initial={{ scale: 0, rotate: 90 }}
          animate={
            phase >= 4 ? { scale: 0, rotate: -90 } :
            phase >= 1 ? { scale: 1, rotate: 0 } :
            { scale: 0, rotate: 90 }
          }
          transition={{ type: "spring", stiffness: 200, damping: 20 }}
        >
          <div className="w-8 h-8 rounded-full border-4 border-accent border-t-transparent animate-spin" style={{ animationDuration: '3s' }} />
          <div className="absolute w-3 h-3 bg-accent rounded-full" />
        </motion.div>

        <div className="overflow-hidden mb-6">
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
            Get paid <span className="text-gradient-accent">faster.</span><br/>
            Anywhere.
          </motion.h2>
        </div>

        <motion.p
          className="text-2xl text-text-secondary max-w-xl"
          initial={{ opacity: 0, x: -50 }}
          animate={
            phase >= 4 ? { opacity: 0, x: 50 } :
            phase >= 3 ? { opacity: 1, x: 0 } :
            { opacity: 0, x: -50 }
          }
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          Multiple payment gateways integrated natively. Reliable payouts for every sale.
        </motion.p>
      </div>

      {/* Right Visuals */}
      <div className="relative w-[40vw] h-[60vh] flex items-center justify-center pointer-events-none">
        {/* Background payment art */}
        <motion.div
          className="absolute inset-0 rounded-full overflow-hidden opacity-60 mix-blend-screen"
          initial={{ scale: 0, opacity: 0 }}
          animate={
            phase >= 4 ? { scale: 1.5, opacity: 0 } :
            phase >= 1 ? { scale: 1, opacity: 0.8 } :
            { scale: 0, opacity: 0 }
          }
          transition={{ duration: 1.5, ease: "easeOut" }}
        >
          <img 
            src={`${import.meta.env.BASE_URL}images/payments.png`}
            alt="Payments"
            className="w-full h-full object-cover rounded-full blur-[2px]"
          />
        </motion.div>

        {/* Floating Payment Cards */}
        {[...Array(3)].map((_, i) => (
          <motion.div
            key={`card-${i}`}
            className="absolute w-64 h-36 rounded-xl bg-gradient-to-br from-bg-muted to-bg-dark border border-white/10 shadow-2xl overflow-hidden backdrop-blur-xl flex flex-col justify-between p-5"
            initial={{ 
              y: 200, 
              opacity: 0, 
              rotate: (i - 1) * 15,
              scale: 0.8,
              x: (i - 1) * 100
            }}
            animate={
              phase >= 4 ? { y: -200, opacity: 0, scale: 1.1 } :
              phase >= 2 ? { 
                y: (i - 1) * 20, 
                opacity: 1, 
                rotate: (i - 1) * 10,
                scale: 1,
                x: (i - 1) * 60
              } :
              { 
                y: 200, 
                opacity: 0, 
                rotate: (i - 1) * 15,
                scale: 0.8,
                x: (i - 1) * 100
              }
            }
            transition={{ 
              type: "spring", 
              stiffness: 100, 
              damping: 15, 
              delay: phase >= 2 && phase < 4 ? 0.2 + (i * 0.15) : 0 
            }}
            style={{ zIndex: 30 - i }}
          >
            <div className="flex justify-between items-start">
              <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
                <div className="w-4 h-4 bg-accent rounded-sm" />
              </div>
              <div className="w-12 h-6 rounded-full bg-white/20 flex items-center px-1">
                <div className="w-4 h-4 rounded-full bg-white/50" />
                <div className="w-4 h-4 rounded-full bg-white/30 -ml-1" />
              </div>
            </div>
            
            <div>
              <div className="w-1/2 h-2 bg-white/20 rounded mb-2" />
              <div className="w-3/4 h-2 bg-white/10 rounded" />
            </div>
          </motion.div>
        ))}

        {/* Success Checkmark popup */}
        <motion.div
          className="absolute -right-8 bottom-[20%] w-16 h-16 rounded-full bg-success flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.5)] z-40"
          initial={{ scale: 0, opacity: 0 }}
          animate={
            phase >= 4 ? { scale: 0, opacity: 0 } :
            phase >= 3 ? { scale: 1, opacity: 1 } :
            { scale: 0, opacity: 0 }
          }
          transition={{ type: "spring", stiffness: 400, damping: 15, delay: phase === 3 ? 0.6 : 0 }}
        >
          <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>
      </div>
    </motion.div>
  );
};
