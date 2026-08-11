import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene2RealEstate() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1000);
    const t2 = setTimeout(() => setPhase(2), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex z-10 overflow-hidden bg-background"
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: '0%', opacity: 1 }}
      exit={{ y: '-10%', opacity: 0, scale: 0.95 }}
      transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* Background Video */}
      <motion.div 
        className="absolute inset-0 w-full h-full z-0"
        initial={{ x: 50, scale: 1.1, filter: 'brightness(0.3)' }}
        animate={{ x: 0, scale: 1, filter: 'brightness(0.6)' }}
        transition={{ duration: 5.5, ease: "easeOut" }}
      >
        <video
          src={`https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/video-artifacts/real-estate.mp4`}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
      </motion.div>

      <div className="relative z-10 w-full h-full flex flex-col justify-end pb-24 px-16 md:px-24">
        
        <div className="flex flex-col md:flex-row items-end justify-between gap-12">
          <div className="max-w-3xl">
            <motion.div 
              className="flex items-center gap-4 mb-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
            >
              <div className="h-px w-8 bg-primary" />
              <span className="font-outfit font-bold text-primary tracking-widest uppercase text-sm">Landlord Properties</span>
            </motion.div>

            <motion.h2 
              className="font-outfit text-6xl md:text-8xl font-bold text-white leading-[1] mb-6 drop-shadow-xl"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              Prime Real<br />Estate
            </motion.h2>
            
            <motion.p
              className="text-xl md:text-2xl text-foreground/80 max-w-xl font-light"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1, delay: 0.9 }}
            >
              Browse, list, and manage residential and commercial spaces across the continent.
            </motion.p>
          </div>

          <div className="flex flex-col gap-4 min-w-[300px]">
            <motion.div
              className="glass-panel p-6 rounded-2xl border-l-4 border-l-primary"
              initial={{ opacity: 0, x: 40 }}
              animate={phase >= 1 ? { opacity: 1, x: 0 } : { opacity: 0, x: 40 }}
              transition={{ duration: 0.8, type: "spring", bounce: 0.3 }}
            >
              <h5 className="text-primary font-bold text-3xl mb-1 font-outfit">10,000+</h5>
              <p className="text-white text-sm">Active Premium Listings</p>
            </motion.div>

            <motion.div
              className="glass-panel p-6 rounded-2xl border-l-4 border-l-accent"
              initial={{ opacity: 0, x: 40 }}
              animate={phase >= 2 ? { opacity: 1, x: 0 } : { opacity: 0, x: 40 }}
              transition={{ duration: 0.8, type: "spring", bounce: 0.3 }}
            >
              <h5 className="text-accent font-bold text-3xl mb-1 font-outfit">Verified</h5>
              <p className="text-white text-sm">Landlords & Developers</p>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}