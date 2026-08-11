import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene1() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800), // First text in
      setTimeout(() => setPhase(2), 3500), // First text out, Second text in
      setTimeout(() => setPhase(3), 4000), // Second text reveals fully
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex items-center justify-center bg-black"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Background Video */}
      <motion.div 
        className="absolute inset-0 w-full h-full"
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 10, ease: 'linear' }}
      >
        <video
          src={`${import.meta.env.BASE_URL}videos/cityscape.mp4`}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      </motion.div>

      {/* Foreground Content */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full px-12 text-center">
        <motion.h1
          className="text-6xl md:text-8xl font-display font-bold text-white tracking-tight"
          initial={{ opacity: 0, y: 30, filter: 'blur(10px)' }}
          animate={{
            opacity: phase === 1 ? 1 : 0,
            y: phase === 1 ? 0 : phase > 1 ? -30 : 30,
            filter: phase === 1 ? 'blur(0px)' : 'blur(10px)'
          }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          Africa doesn't just need <span className="text-gray-400">apps</span>.
        </motion.h1>

        <motion.h1
          className="absolute text-6xl md:text-8xl font-display font-bold text-white tracking-tight leading-tight"
          initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
          animate={{
            opacity: phase >= 2 ? 1 : 0,
            scale: phase >= 2 ? 1 : 0.9,
            filter: phase >= 2 ? 'blur(0px)' : 'blur(10px)'
          }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          Africa needs <br />
          <span className="text-gradient-gold">Digital Infrastructure.</span>
        </motion.h1>
      </div>

      {/* Decorative accent */}
      <motion.div
        className="absolute bottom-12 w-px h-24 bg-gradient-to-b from-accent to-transparent"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: phase >= 2 ? 96 : 0, opacity: phase >= 2 ? 1 : 0 }}
        transition={{ duration: 1, delay: 0.5 }}
      />
    </motion.div>
  );
}