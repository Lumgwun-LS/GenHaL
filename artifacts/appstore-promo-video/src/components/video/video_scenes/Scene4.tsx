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
      
      <div className="relative z-10 flex flex-col items-center justify-center text-center w-full px-12 gap-2">
        <div className="overflow-hidden py-3">
          <motion.h2
            className="text-[72px] leading-tight font-sans font-black text-white uppercase tracking-tighter"
            initial={{ y: "110%" }}
            animate={{ y: phase >= 1 ? 0 : "110%" }}
            transition={{ duration: 1.2, ease: "circOut" }}
          >
            The Best
          </motion.h2>
        </div>
        
        <div className="overflow-hidden py-3">
          <motion.div
            className="flex items-center gap-8"
            initial={{ y: "110%", opacity: 0 }}
            animate={{ y: phase >= 2 ? 0 : "110%", opacity: phase >= 2 ? 1 : 0 }}
            transition={{ duration: 1.2, ease: "circOut" }}
          >
            <div className="w-32 h-[3px] bg-accent shrink-0" />
            <h2 className="text-[62px] leading-tight font-serif font-bold text-accent italic whitespace-nowrap">
              App Store
            </h2>
            <div className="w-32 h-[3px] bg-accent shrink-0" />
          </motion.div>
        </div>

        <div className="overflow-hidden py-3">
          <motion.h2
            className="text-[72px] leading-tight font-sans font-black text-white uppercase tracking-tighter"
            initial={{ y: "-110%" }}
            animate={{ y: phase >= 3 ? 0 : "-110%" }}
            transition={{ duration: 1.2, ease: "circOut" }}
          >
            In The World.
          </motion.h2>
        </div>

        <motion.p
          className="mt-6 text-xl text-white/90 font-serif max-w-3xl leading-relaxed"
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