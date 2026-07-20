import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function Scene2({ currentScene }: { currentScene: number }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 2000), // TAG
      setTimeout(() => setPhase(2), 4000), // Headline 1
      setTimeout(() => setPhase(3), 6000), // Headline 2
      setTimeout(() => setPhase(4), 8000), // Desc
      setTimeout(() => setPhase(5), 11000), // Card 1
      setTimeout(() => setPhase(6), 13000), // Card 2
      setTimeout(() => setPhase(7), 15000)  // Card 3
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const featureCards = [
    { title: "AI-Powered", subtitle: "Upload a ZIP. AI generates the listing." },
    { title: "Verified Network", subtitle: "Trusted Developer Program built for scale." },
    { title: "One-Click Deploy", subtitle: "Publish instantly across web and mobile." }
  ];

  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center p-10"
      initial={{ x: "100%", clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)" }}
      animate={{ x: 0, clipPath: "polygon(0 0, 100% 0, 100% 100%, 0 100%)" }}
      exit={{ x: "-50%", opacity: 0, filter: "blur(10px)" }}
      transition={{ duration: 1.5, ease: [0.76, 0, 0.24, 1] }}
    >
      <motion.div 
        className="absolute inset-0 bg-cover bg-center opacity-20"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/bg-grid.jpg)` }}
        animate={{ 
          scale: [1, 1.2],
          rotate: [0, 2]
        }}
        transition={{ duration: 20, ease: "linear" }}
      />

      <div className="flex w-full h-full max-w-[1600px] relative z-10 items-center">
        <div className="w-1/2 flex flex-col justify-center pr-20">
          <motion.div
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: phase >= 1 ? 1 : 0, x: phase >= 1 ? 0 : -50 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="inline-block px-6 py-3 bg-primary/20 border border-primary/50 text-primary font-bold rounded-full mb-8 w-max tracking-widest text-lg"
          >
            FOR DEVELOPERS
          </motion.div>
          
          <motion.h2 
            className="text-5xl font-sans font-black leading-tight text-white mb-4"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 50 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          >
            Zero Complexity.
          </motion.h2>
          
          <motion.h2 
            className="text-5xl font-sans font-black leading-tight text-accent"
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 50 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          >
            Infinite Scale.
          </motion.h2>
          
          <motion.p
            className="text-lg text-gray-400 mt-6 max-w-xl font-serif leading-relaxed"
            initial={{ opacity: 0, filter: "blur(10px)" }}
            animate={{ opacity: phase >= 4 ? 1 : 0, filter: phase >= 4 ? "blur(0px)" : "blur(10px)" }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          >
            The tools you need to reach millions, built exclusively for African innovators. No friction, just pure discovery.
          </motion.p>
        </div>

        <div className="w-1/2 relative flex flex-col justify-center gap-3 pl-10">
          {featureCards.map((card, i) => (
            <motion.div
              key={i}
              className="bg-black/40 border border-white/10 backdrop-blur-xl p-5 rounded-2xl relative overflow-hidden"
              initial={{ x: 100, opacity: 0 }}
              animate={{ 
                x: phase >= i + 5 ? 0 : 100, 
                opacity: phase >= i + 5 ? 1 : 0,
                scale: phase >= i + 5 ? 1 : 0.95
              }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            >
              <motion.div 
                className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-primary to-accent"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: phase >= i + 5 ? 1 : 0 }}
                transition={{ duration: 1, delay: 0.5 }}
              />
              <h3 className="text-2xl font-sans font-bold text-white mb-2 pl-4">{card.title}</h3>
              <p className="text-base text-gray-400 font-serif pl-4">{card.subtitle}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}