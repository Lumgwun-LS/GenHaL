import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

export default function Scene2({ currentScene }: { currentScene: number }) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 1500),  // tag
      setTimeout(() => setPhase(2), 3000),  // headline 1
      setTimeout(() => setPhase(3), 4500),  // headline 2
      setTimeout(() => setPhase(4), 6000),  // description
      setTimeout(() => setPhase(5), 8000),  // cards
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  const featureCards = [
    { icon: "🤖", title: "AI-Powered", subtitle: "Upload a ZIP. AI generates the listing." },
    { icon: "✅", title: "Verified Network", subtitle: "Trusted Developer Program built for scale." },
    { icon: "🚀", title: "One-Click Deploy", subtitle: "Publish instantly across web and mobile." },
  ];

  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-16 py-10 gap-6"
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "-50%", opacity: 0, filter: "blur(10px)" }}
      transition={{ duration: 1.5, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* background */}
      <motion.div
        className="absolute inset-0 bg-cover bg-center opacity-20"
        style={{ backgroundImage: `url(${import.meta.env.BASE_URL}images/bg-grid.jpg)` }}
        animate={{ scale: [1, 1.2], rotate: [0, 2] }}
        transition={{ duration: 20, ease: "linear" }}
      />

      {/* tag */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: phase >= 1 ? 1 : 0, y: phase >= 1 ? 0 : -16 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="relative z-10 px-6 py-2 bg-primary/20 border border-primary/50 text-primary font-bold rounded-full tracking-widest text-base"
      >
        FOR DEVELOPERS
      </motion.div>

      {/* headlines */}
      <div className="relative z-10 text-center leading-tight">
        <motion.span
          className="block text-5xl font-sans font-black text-white"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: phase >= 2 ? 1 : 0, y: phase >= 2 ? 0 : 30 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          Zero Complexity.
        </motion.span>
        <motion.span
          className="block text-5xl font-sans font-black text-accent"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: phase >= 3 ? 1 : 0, y: phase >= 3 ? 0 : 30 }}
          transition={{ duration: 1, ease: "easeOut" }}
        >
          Infinite Scale.
        </motion.span>
      </div>

      {/* description */}
      <motion.p
        className="relative z-10 text-lg text-gray-300 font-serif text-center max-w-2xl leading-relaxed"
        initial={{ opacity: 0, filter: "blur(8px)" }}
        animate={{ opacity: phase >= 4 ? 1 : 0, filter: phase >= 4 ? "blur(0px)" : "blur(8px)" }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      >
        The tools you need to reach millions, built exclusively for African innovators.
        No friction, just pure discovery.
      </motion.p>

      {/* cards — horizontal row */}
      <motion.div
        className="relative z-10 flex gap-5 w-full max-w-4xl"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: phase >= 5 ? 1 : 0, y: phase >= 5 ? 0 : 30 }}
        transition={{ duration: 1, ease: "easeOut" }}
      >
        {featureCards.map((card, i) => (
          <motion.div
            key={i}
            className="flex-1 bg-black/50 border border-white/10 backdrop-blur-xl rounded-2xl p-6 relative overflow-hidden"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: phase >= 5 ? 1 : 0, y: phase >= 5 ? 0 : 20 }}
            transition={{ duration: 0.7, delay: i * 0.15, ease: "easeOut" }}
          >
            {/* colour bar */}
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-accent" />
            <div className="text-3xl mb-3">{card.icon}</div>
            <h3 className="text-xl font-sans font-bold text-white mb-1">{card.title}</h3>
            <p className="text-sm text-gray-400 font-serif leading-snug">{card.subtitle}</p>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  );
}
