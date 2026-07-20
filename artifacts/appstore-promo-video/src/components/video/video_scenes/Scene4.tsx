import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function Scene4({ currentScene }: { currentScene: number }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 2000), // The Best
      setTimeout(() => setPhase(2), 5000), // App Store
      setTimeout(() => setPhase(3), 8000), // In The World
      setTimeout(() => setPhase(4), 11000) // Paragaph
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center"
      initial={{ clipPath: "circle(0% at 50% 50%)" }}
      animate={{ clipPath: "circle(150% at 50% 50%)" }}
      exit={{ opacity: 0, filter: "blur(20px)", scale: 1.2 }}
      transition={{ duration: 2, ease: [0.76, 0, 0.24, 1] }}
    >
      <div className="absolute inset-0 bg-primary/90" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-transparent to-black/90" />
      
      <div className="relative z-10 flex flex-col items-center justify-center text-center w-full px-12">
        <div className="overflow-hidden">
          <motion.h2
            className="text-[140px] leading-none font-sans font-black text-white uppercase tracking-tighter"
            initial={{ y: "100%" }}
            animate={{ y: phase >= 1 ? 0 : "100%" }}
            transition={{ duration: 1.2, ease: "circOut" }}
          >
            The Best
          </motion.h2>
        </div>
        
        <div className="overflow-hidden py-4">
          <motion.div
            className="flex items-center gap-10 my-6"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: phase >= 2 ? 0 : "100%", opacity: phase >= 2 ? 1 : 0 }}
            transition={{ duration: 1.2, ease: "circOut" }}
          >
            <div className="w-48 h-2 bg-accent" />
            <h2 className="text-[120px] leading-none font-serif font-bold text-accent italic">
              App Store
            </h2>
            <div className="w-48 h-2 bg-accent" />
          </motion.div>
        </div>

        <div className="overflow-hidden">
          <motion.h2
            className="text-[140px] leading-none font-sans font-black text-white uppercase tracking-tighter"
            initial={{ y: "-100%" }}
            animate={{ y: phase >= 3 ? 0 : "-100%" }}
            transition={{ duration: 1.2, ease: "circOut" }}
          >
            In The World.
          </motion.h2>
        </div>

        <motion.p
          className="mt-16 text-4xl text-white/90 font-serif max-w-4xl leading-relaxed"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: phase >= 4 ? 1 : 0, y: phase >= 4 ? 0 : 30 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
        >
          African-first design. Deep AI integration.<br/>Beautiful user experience.
        </motion.p>
      </div>
    </motion.div>
  );
}