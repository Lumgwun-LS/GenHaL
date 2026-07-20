import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function Scene1({ currentScene }: { currentScene: number }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 2000); // Logo
    const t2 = setTimeout(() => setPhase(2), 5000); // Africa's
    const t3 = setTimeout(() => setPhase(3), 8000); // App Store
    const t4 = setTimeout(() => setPhase(4), 11000); // Shrink slightly
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 1.5, ease: "easeInOut" }}
    >
      <motion.div 
        className="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-overlay"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/bg-landscape.jpg)` }}
        initial={{ scale: 1.2 }}
        animate={{ scale: 1 }}
        transition={{ duration: 15, ease: "easeOut" }}
      />

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ scale: 0, rotate: -45, opacity: 0 }}
          animate={{ 
            scale: phase >= 4 ? 0.8 : phase >= 1 ? 1 : 0, 
            rotate: phase >= 1 ? 0 : -45, 
            opacity: phase >= 1 ? 1 : 0,
            y: phase >= 4 ? -40 : 0
          }}
          transition={{ 
            type: "spring", 
            stiffness: 60, 
            damping: 15, 
            mass: 1.5
          }}
          className="w-28 h-28 rounded-full overflow-hidden border-4 border-primary shadow-[0_0_60px_rgba(212,43,43,0.6)] mb-6 bg-white flex items-center justify-center"
        >
          <img 
            src={`${import.meta.env.BASE_URL}images/logo.jpg`} 
            alt="Awajimaa Logo" 
            className="w-[110%] h-[110%] object-cover object-center"
          />
        </motion.div>

        <div className="overflow-hidden">
          <motion.h1 
            className="text-5xl font-serif font-bold text-white tracking-tight"
            initial={{ y: "120%" }}
            animate={{ y: phase >= 2 ? 0 : "120%" }}
            transition={{ type: "spring", stiffness: 80, damping: 20 }}
          >
            Africa's
          </motion.h1>
        </div>

        <div className="overflow-hidden mt-4">
          <motion.h1 
            className="text-7xl font-sans font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-primary via-accent to-primary"
            initial={{ y: "120%" }}
            animate={{ y: phase >= 3 ? 0 : "120%" }}
            transition={{ type: "spring", stiffness: 80, damping: 20 }}
          >
            App Store
          </motion.h1>
        </div>
      </div>
    </motion.div>
  );
}