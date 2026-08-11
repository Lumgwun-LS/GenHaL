import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPhase(1), 4000);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex bg-[#1a0f00]"
      initial={{ filter: 'blur(20px)', opacity: 0 }}
      animate={{ filter: 'blur(0px)', opacity: 1 }}
      exit={{ x: '-100%' }}
      transition={{ duration: 1.2 }}
    >
      <div className="absolute inset-0 w-full h-full">
        <video
          src={`${import.meta.env.BASE_URL}videos/heritage.mp4`}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-40 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#1a0f00]/60 to-[#1a0f00]" />
      </div>

      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center text-center px-12">
        <div className="relative h-[400px] w-full max-w-5xl flex items-center justify-center">
          {/* Phase 0: Genhal */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ 
              opacity: phase === 0 ? 1 : 0,
              scale: phase === 0 ? 1 : 1.1,
              pointerEvents: phase === 0 ? 'auto' : 'none'
            }}
            transition={{ duration: 1 }}
          >
            <h3 className="text-[#d97706] tracking-[0.2em] uppercase font-bold text-sm mb-6">Platform 04</h3>
            <h2 className="text-7xl font-display font-bold text-white mb-6">GENHAL</h2>
            <p className="text-3xl text-[#fcd34d] font-light max-w-2xl">
              Digital Heritage & Ancestry Network.
            </p>
            <p className="text-xl text-gray-300 mt-6 max-w-3xl">
              Preserving indigenous language data for AI. Securing kingdom registries and family wealth.
            </p>
          </motion.div>

          {/* Phase 1: Schools */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            initial={{ opacity: 0, y: 50 }}
            animate={{ 
              opacity: phase === 1 ? 1 : 0,
              y: phase === 1 ? 0 : 50,
              pointerEvents: phase === 1 ? 'auto' : 'none'
            }}
            transition={{ duration: 1 }}
          >
            <h3 className="text-primary tracking-[0.2em] uppercase font-bold text-sm mb-6">Platform 05</h3>
            <h2 className="text-7xl font-display font-bold text-white mb-6">AWAJIMAA SCHOOLS</h2>
            <p className="text-3xl text-green-400 font-light max-w-2xl">
              Education Management Platform.
            </p>
            <p className="text-xl text-gray-300 mt-6 max-w-3xl">
              AI-powered learning tools for African classrooms. Connecting parents, teachers, and students at scale.
            </p>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}