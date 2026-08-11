import { motion } from 'framer-motion';

export function Scene9() {
  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-black"
      initial={{ opacity: 0, scale: 1.2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 w-full h-full">
        <video
          src={`${import.meta.env.BASE_URL}videos/cityscape.mp4`}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/80 to-black/40" />
      </div>

      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center text-center">
        
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1, duration: 1.5, type: "spring", stiffness: 100, damping: 20 }}
          className="mb-12 relative"
        >
          <div className="absolute inset-0 bg-accent blur-[100px] opacity-20 rounded-full" />
          <img 
            src="https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/app-store/media/1785809891139-c7a0db95f5b4.jpg" 
            alt="Logo" 
            className="w-32 h-32 rounded-full border-2 border-white/20 object-cover shadow-[0_0_50px_rgba(255,255,255,0.1)]"
          />
        </motion.div>

        <motion.h2
          className="text-7xl md:text-[6vw] font-display font-bold text-white mb-6 tracking-tighter"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.5, duration: 1.2 }}
        >
          AWAJIMAA
        </motion.h2>

        <motion.p
          className="text-2xl text-gray-400 font-light tracking-widest uppercase mb-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2, duration: 1 }}
        >
          Built by Awajimaa Group
        </motion.p>

        <motion.div
          className="px-10 py-5 glass-panel border border-accent/30 rounded-full"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.5, duration: 1, type: "spring" }}
        >
          <p className="text-2xl text-accent font-bold tracking-wide">
            Invest in the Future of Africa.
          </p>
        </motion.div>

      </div>
    </motion.div>
  );
}