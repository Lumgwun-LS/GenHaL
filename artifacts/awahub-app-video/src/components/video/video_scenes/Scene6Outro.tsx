import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene6Outro() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1000);
    const t2 = setTimeout(() => setPhase(2), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex flex-col items-center justify-center z-10 overflow-hidden bg-background"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* Background Video */}
      <motion.div 
        className="absolute inset-0 w-full h-full z-0"
        initial={{ filter: 'brightness(0.3) saturate(1.2)' }}
        animate={{ filter: 'brightness(0.5) saturate(1.1)' }}
        transition={{ duration: 6, ease: "easeOut" }}
      >
        <video
          src={`https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/video-artifacts/pride.mp4`}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px]" />
      </motion.div>

      <div className="relative z-10 flex flex-col items-center text-center px-6">
        
        <motion.div 
          className="w-24 h-24 rounded-3xl bg-primary flex items-center justify-center shadow-2xl shadow-primary/40 mb-8"
          initial={{ opacity: 0, y: 50, rotate: -10 }}
          animate={{ opacity: 1, y: 0, rotate: 0 }}
          transition={{ duration: 1, type: "spring", bounce: 0.4 }}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 22H22L12 2Z" fill="hsl(var(--primary-foreground))" />
            <circle cx="12" cy="15" r="3" fill="hsl(var(--primary))" />
          </svg>
        </motion.div>

        <motion.h1 
          className="font-outfit text-6xl md:text-8xl font-bold tracking-tight text-white mb-6 drop-shadow-lg"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={phase >= 1 ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          AWA HUB
        </motion.h1>

        <motion.p
          className="text-2xl md:text-3xl font-light text-foreground/90 tracking-wide max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 1 }}
        >
          Commerce with <span className="text-primary font-medium">Community</span> at its Heart.
        </motion.p>
        
        <motion.div 
          className="absolute bottom-12 w-full flex justify-center"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1, delay: 0.5 }}
        >
          <div className="flex gap-6 items-center opacity-60 grayscale">
            {/* Mock app store badges or partner logos could go here. We'll use simple dots to represent scale. */}
            <div className="h-1.5 w-1.5 rounded-full bg-white" />
            <div className="h-1.5 w-1.5 rounded-full bg-white" />
            <div className="h-1.5 w-1.5 rounded-full bg-white" />
          </div>
        </motion.div>

      </div>
    </motion.div>
  );
}