import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function Scene5({ currentScene }: { currentScene: number }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 2000), // Logo
      setTimeout(() => setPhase(2), 5000), // Title & Slogan
      setTimeout(() => setPhase(3), 8000)  // Powered by
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2 }}
    >
      <motion.div 
        className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 to-black" 
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 8, repeat: Infinity }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ scale: 0, opacity: 0, rotate: 90 }}
          animate={{ 
            scale: phase >= 1 ? 1 : 0, 
            opacity: phase >= 1 ? 1 : 0,
            rotate: phase >= 1 ? 0 : 90
          }}
          transition={{ type: "spring", stiffness: 60, damping: 15 }}
          className="w-56 h-56 rounded-full overflow-hidden border-2 border-white/20 mb-16 shadow-[0_0_100px_rgba(245,197,24,0.4)] bg-white flex items-center justify-center"
        >
          <img 
            src={`${import.meta.env.BASE_URL}images/logo.jpg`} 
            alt="Awajimaa Logo" 
            className="w-[110%] h-[110%] object-cover object-center"
          />
        </motion.div>

        <div className="overflow-hidden mb-8">
          <motion.h2
            className="text-8xl font-serif font-bold text-white tracking-wide"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: phase >= 2 ? 0 : 80, opacity: phase >= 2 ? 1 : 0 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          >
            Awajimaa App Store
          </motion.h2>
        </div>

        <motion.p
          className="text-4xl font-sans text-accent font-bold tracking-[0.2em] uppercase"
          initial={{ opacity: 0, filter: "blur(20px)", y: 20 }}
          animate={{ 
            opacity: phase >= 2 ? 1 : 0, 
            filter: phase >= 2 ? "blur(0px)" : "blur(20px)",
            y: phase >= 2 ? 0 : 20
          }}
          transition={{ duration: 1.5, delay: 0.5 }}
        >
          Stay Safe, Do More, & Be More
        </motion.p>

        <motion.div
          className="absolute bottom-[-20vh] w-full text-center"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 50 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        >
          <p className="text-gray-400 font-sans text-xl tracking-[0.3em] uppercase">
            Powered by The Lumgwun Solutions & Awajimaa Group
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}