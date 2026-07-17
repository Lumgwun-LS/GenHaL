import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene4Logistics() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1000);
    const t2 = setTimeout(() => setPhase(2), 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex z-10 overflow-hidden bg-background"
      initial={{ y: '100%' }}
      animate={{ y: '0%' }}
      exit={{ opacity: 0, rotateX: 20, transformPerspective: 1000 }}
      transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* Background Video */}
      <motion.div 
        className="absolute inset-0 w-full h-full z-0"
        initial={{ y: -50, scale: 1.1, filter: 'brightness(0.3)' }}
        animate={{ y: 0, scale: 1, filter: 'brightness(0.6)' }}
        transition={{ duration: 5.5, ease: "easeOut" }}
      >
        <video
          src={`${import.meta.env.BASE_URL}videos/logistics.mp4`}
          className="w-full h-full object-cover"
          autoPlay
          muted
          loop
          playsInline
        />
        <div className="absolute inset-0 bg-background/40" />
      </motion.div>

      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-16 text-center">
        
        <motion.div 
          className="mb-6 flex flex-col items-center"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.4, type: "spring" }}
        >
          <div className="w-16 h-16 rounded-2xl bg-primary/20 backdrop-blur-md flex items-center justify-center mb-4 border border-primary/30">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>
          <span className="font-outfit font-bold text-primary tracking-widest uppercase text-sm">Multi-Vendor Logistics</span>
        </motion.div>

        <motion.h2 
          className="font-outfit text-6xl md:text-8xl font-bold text-white leading-[1] mb-12 drop-shadow-2xl"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          Last-Mile Delivery<br />
          <span className="text-white/80 font-light italic">at Scale</span>
        </motion.h2>

        {/* Tracking UI Simulation */}
        <div className="w-full max-w-3xl relative">
          {/* Track Line */}
          <div className="absolute top-1/2 left-0 w-full h-1 bg-white/10 -translate-y-1/2 rounded-full overflow-hidden">
            <motion.div 
              className="absolute inset-y-0 left-0 bg-primary"
              initial={{ width: '0%' }}
              animate={phase >= 2 ? { width: '100%' } : phase >= 1 ? { width: '50%' } : { width: '0%' }}
              transition={{ duration: 1.5, ease: "easeInOut" }}
            />
          </div>

          <div className="flex justify-between relative z-10">
            <motion.div 
              className="flex flex-col items-center gap-3"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.8 }}
            >
              <div className="w-6 h-6 rounded-full bg-primary ring-4 ring-background shadow-[0_0_15px_hsl(var(--primary))]" />
              <span className="text-sm font-medium text-white">Vendor</span>
            </motion.div>

            <motion.div 
              className="flex flex-col items-center gap-3"
              initial={{ opacity: 0, y: 20 }}
              animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6 }}
            >
              <div className="w-6 h-6 rounded-full bg-primary ring-4 ring-background shadow-[0_0_15px_hsl(var(--primary))]" />
              <span className="text-sm font-medium text-white">Hub</span>
            </motion.div>

            <motion.div 
              className="flex flex-col items-center gap-3"
              initial={{ opacity: 0, y: 20 }}
              animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
              transition={{ duration: 0.6 }}
            >
              <div className="w-6 h-6 rounded-full bg-primary ring-4 ring-background shadow-[0_0_15px_hsl(var(--primary))]" />
              <span className="text-sm font-medium text-white">Customer</span>
            </motion.div>
          </div>
        </div>

      </div>
    </motion.div>
  );
}