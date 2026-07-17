import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene5Insurance() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex z-10 overflow-hidden bg-background"
      initial={{ clipPath: 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)' }}
      animate={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' }}
      exit={{ opacity: 0, filter: 'blur(20px)' }}
      transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* Background Video */}
      <motion.div 
        className="absolute inset-0 w-full h-full z-0"
        initial={{ scale: 1.2, filter: 'brightness(0.4)' }}
        animate={{ scale: 1, filter: 'brightness(0.6)' }}
        transition={{ duration: 6, ease: "easeOut" }}
      >
        <video
          src={`${import.meta.env.BASE_URL}videos/insurance.mp4`}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute inset-0 bg-gradient-to-br from-background via-transparent to-background/80" />
      </motion.div>

      <div className="relative z-10 w-full h-full flex flex-col md:flex-row items-center justify-between px-16 md:px-24">
        
        <div className="max-w-xl order-2 md:order-1">
          <motion.div 
            className="flex items-center gap-3 mb-6"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span className="font-outfit font-bold text-primary tracking-widest uppercase text-sm">Embedded Insurance</span>
          </motion.div>

          <motion.h2 
            className="font-outfit text-5xl md:text-7xl font-bold text-white leading-[1.1] mb-6 drop-shadow-xl"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            Coverage built into <span className="text-gradient-light">every move</span>
          </motion.h2>

          <motion.p
            className="text-xl text-foreground/80 font-light mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1, delay: 0.8 }}
          >
            Protecting people, property, and business. Trust engineered directly into the marketplace.
          </motion.p>
          
          <div className="flex gap-4">
            {['Properties', 'Logistics', 'Health'].map((item, i) => (
              <motion.div
                key={item}
                className="px-4 py-2 rounded-full border border-white/20 bg-white/5 backdrop-blur-sm"
                initial={{ opacity: 0, y: 20 }}
                animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ duration: 0.6, delay: i * 0.1 }}
              >
                <span className="text-sm font-medium text-white">{item}</span>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Shield Graphic animation */}
        <div className="relative w-64 h-64 order-1 md:order-2 mb-12 md:mb-0">
          <motion.div 
            className="absolute inset-0 bg-primary/20 rounded-full blur-[60px]"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={phase >= 1 ? { scale: 1.2, opacity: 1 } : { scale: 0.5, opacity: 0 }}
            transition={{ duration: 2, ease: "easeOut" }}
          />
          <motion.div
            className="absolute inset-0 border-2 border-primary/30 rounded-full"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={phase >= 1 ? { scale: 1.5, opacity: 0 } : { scale: 0.8, opacity: 0 }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.div
            className="relative w-full h-full flex items-center justify-center z-10"
            initial={{ opacity: 0, scale: 0.5, rotateY: 90 }}
            animate={phase >= 1 ? { opacity: 1, scale: 1, rotateY: 0 } : { opacity: 0, scale: 0.5, rotateY: 90 }}
            transition={{ type: "spring", stiffness: 60, damping: 20 }}
          >
            <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="url(#gradient-shield)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round">
              <defs>
                <linearGradient id="gradient-shield" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="hsl(var(--primary))" />
                  <stop offset="100%" stopColor="hsl(var(--accent))" />
                </linearGradient>
              </defs>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="hsl(var(--primary)/0.1)"/>
              <path d="M12 8v4" strokeWidth="2" />
              <path d="M12 16h.01" strokeWidth="3" />
            </svg>
          </motion.div>
        </div>

      </div>
    </motion.div>
  );
}