import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function Scene3({ currentScene }: { currentScene: number }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 2000), // Title
      setTimeout(() => setPhase(2), 5000), // Card 1
      setTimeout(() => setPhase(3), 8000), // Card 2
      setTimeout(() => setPhase(4), 11000), // Card 3
      setTimeout(() => setPhase(5), 14000)  // Highlight
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-black"
      initial={{ scale: 1.2, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.9, opacity: 0, rotateX: 10 }}
      transition={{ duration: 1.5, ease: "circOut" }}
    >
      <motion.div 
        className="absolute inset-0 bg-cover bg-center opacity-30"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/bg-pattern.jpg)` }}
        animate={{ 
          backgroundPosition: ["0% 0%", "20% 20%"],
          scale: [1, 1.1]
        }}
        transition={{ duration: 20, ease: "linear" }}
      />

      <div className="relative z-10 w-full max-w-[1600px] flex flex-col items-center">
        <motion.h2
          className="text-5xl font-serif font-bold text-center text-white mb-12"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : 50 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        >
          Discover The Ecosystem
        </motion.h2>

        <div className="grid grid-cols-3 gap-12 w-full px-12">
          {["Trending", "Featured", "Categories"].map((label, i) => (
            <motion.div
              key={i}
              className="aspect-square bg-gradient-to-br from-white/10 to-transparent border border-white/5 rounded-[40px] p-12 flex flex-col justify-end relative overflow-hidden group shadow-2xl"
              initial={{ opacity: 0, y: 100, rotateX: 30 }}
              animate={{ 
                opacity: phase >= i + 2 ? 1 : 0, 
                y: phase >= i + 2 ? 0 : 100,
                rotateX: phase >= i + 2 ? 0 : 30
              }}
              transition={{ type: "spring", stiffness: 80, damping: 20 }}
            >
              <motion.div 
                className="absolute inset-0 bg-gradient-to-t from-primary/60 via-primary/10 to-transparent opacity-0 mix-blend-overlay"
                animate={{ opacity: phase >= 5 ? 0.8 : 0 }}
                transition={{ duration: 2 }}
              />
              <div className="w-20 h-20 bg-white/10 rounded-full mb-auto backdrop-blur-md flex items-center justify-center border border-white/20">
                 <div className="w-10 h-10 rounded-full bg-accent" />
              </div>
              <h3 className="text-3xl font-sans font-bold text-white relative z-10">{label}</h3>
              <p className="text-lg text-gray-300 font-serif mt-2 relative z-10">Curated for you</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}