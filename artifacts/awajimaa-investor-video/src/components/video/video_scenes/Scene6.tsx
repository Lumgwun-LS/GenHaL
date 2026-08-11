import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Scene6() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPhase(1), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex bg-[#080d1a]"
      initial={{ filter: 'blur(20px)', opacity: 0 }}
      animate={{ filter: 'blur(0px)', opacity: 1 }}
      exit={{ x: '-100%' }}
      transition={{ duration: 1.2 }}
    >
      {/* Shared video background */}
      <div className="absolute inset-0 w-full h-full">
        <video
          src={`${import.meta.env.BASE_URL}videos/heritage.mp4`}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-35 mix-blend-screen"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#080d1a]/60 to-[#080d1a]" />
      </div>

      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center text-center px-12">
        <div className="relative w-full max-w-5xl">

          {/* ── GENHAL (Phase 0) ───────────────────────── */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            animate={{
              opacity: phase === 0 ? 1 : 0,
              scale: phase === 0 ? 1 : 1.08,
              pointerEvents: phase === 0 ? 'auto' : 'none',
            }}
            transition={{ duration: 0.9 }}
          >
            <motion.div
              className="flex items-center gap-3 mb-6"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              <span className="w-8 h-px bg-amber-400" />
              <h3 className="text-amber-400 tracking-[0.25em] uppercase font-bold text-sm">Platform 04</h3>
              <span className="w-8 h-px bg-amber-400" />
            </motion.div>

            <motion.h2
              className="text-7xl font-display font-bold text-white mb-5"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.9 }}
            >
              GENHAL
            </motion.h2>

            <motion.p
              className="text-3xl text-amber-300 font-light max-w-2xl mb-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9, duration: 0.8 }}
            >
              Digital Heritage &amp; Ancestry Network.
            </motion.p>

            <motion.p
              className="text-xl text-gray-300 max-w-3xl mb-10 leading-relaxed"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1, duration: 0.8 }}
            >
              Preserving indigenous languages through AI. Securing kingdom civic registries, family genealogy, and generational wealth across Africa.
            </motion.p>

            <motion.div
              className="flex items-center gap-3 px-5 py-3 rounded-full border border-amber-400/40 bg-amber-400/10 w-fit mx-auto"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.6, duration: 0.8 }}
            >
              <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <span className="text-amber-400 font-mono text-sm tracking-wider">genhal.awajimaa.com</span>
            </motion.div>
          </motion.div>

          {/* ── AWAJIMAA SCHOOLS (Phase 1) ─────────────── */}
          <motion.div
            className="absolute inset-0 flex flex-col items-center justify-center"
            animate={{
              opacity: phase === 1 ? 1 : 0,
              y: phase === 1 ? 0 : 60,
              pointerEvents: phase === 1 ? 'auto' : 'none',
            }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <motion.div
              className="flex items-center gap-3 mb-6"
              animate={{ opacity: phase === 1 ? 1 : 0 }}
              transition={{ delay: 0.3, duration: 0.8 }}
            >
              <span className="w-8 h-px bg-emerald-400" />
              <h3 className="text-emerald-400 tracking-[0.25em] uppercase font-bold text-sm">Platform 05</h3>
              <span className="w-8 h-px bg-emerald-400" />
            </motion.div>

            <motion.h2
              className="text-6xl md:text-7xl font-display font-bold text-white mb-5"
              animate={{ opacity: phase === 1 ? 1 : 0, y: phase === 1 ? 0 : 20 }}
              transition={{ delay: 0.4, duration: 0.9 }}
            >
              AWAJIMAA SCHOOLS
            </motion.h2>

            <motion.p
              className="text-3xl text-emerald-300 font-light max-w-2xl mb-6"
              animate={{ opacity: phase === 1 ? 1 : 0 }}
              transition={{ delay: 0.6, duration: 0.8 }}
            >
              Education Management Platform.
            </motion.p>

            <motion.p
              className="text-xl text-gray-300 max-w-3xl mb-8 leading-relaxed"
              animate={{ opacity: phase === 1 ? 1 : 0 }}
              transition={{ delay: 0.8, duration: 0.8 }}
            >
              AI-powered learning tools for African schools, colleges &amp; universities. Connecting parents, teachers, and students at scale — with real-time performance tracking.
            </motion.p>

            <div className="flex flex-wrap gap-4 justify-center mb-10">
              {['School Management', 'AI Learning Tools', 'Parent-Teacher Connect', 'Performance Analytics'].map((item, i) => (
                <motion.div
                  key={item}
                  className="px-5 py-2 rounded-full bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-sm font-medium"
                  animate={{ opacity: phase === 1 ? 1 : 0, scale: phase === 1 ? 1 : 0.85 }}
                  transition={{ delay: 1 + i * 0.12, duration: 0.6 }}
                >
                  {item}
                </motion.div>
              ))}
            </div>

            <motion.div
              className="flex items-center gap-3 px-5 py-3 rounded-full border border-emerald-400/40 bg-emerald-400/10 w-fit mx-auto"
              animate={{ opacity: phase === 1 ? 1 : 0, y: phase === 1 ? 0 : 10 }}
              transition={{ delay: 1.6, duration: 0.8 }}
            >
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 font-mono text-sm tracking-wider">schools.awajimaa.com</span>
            </motion.div>
          </motion.div>

        </div>
      </div>
    </motion.div>
  );
}
