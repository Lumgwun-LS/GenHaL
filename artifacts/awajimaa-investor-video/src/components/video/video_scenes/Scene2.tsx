import { motion } from 'framer-motion';

export function Scene2() {
  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex items-center justify-center bg-black"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, y: -50 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div 
        className="absolute inset-0 w-full h-full"
        initial={{ scale: 1.1 }}
        animate={{ scale: 1 }}
        transition={{ duration: 10, ease: 'linear' }}
      >
        <video
          src={`${import.meta.env.BASE_URL}videos/network_africa.mp4`}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black via-black/70 to-transparent" />
      </motion.div>

      <div className="relative z-10 w-full max-w-7xl px-12 flex flex-col items-start justify-center h-full">
        <motion.div 
          className="flex items-center gap-4 mb-6"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.5, duration: 1 }}
        >
          <div className="w-12 h-px bg-accent" />
          <p className="text-accent tracking-[0.2em] font-bold text-sm uppercase">The Opportunity</p>
        </motion.div>

        <motion.h2
          className="text-7xl md:text-[8vw] font-display font-bold leading-none text-white tracking-tighter"
          initial={{ opacity: 0, y: 50, rotateX: 20 }}
          animate={{ opacity: 1, y: 0, rotateX: 0 }}
          transition={{ delay: 0.8, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          style={{ transformPerspective: 1000 }}
        >
          1.4 Billion
          <br />
          <span className="text-gray-500">People.</span>
        </motion.h2>

        <motion.div 
          className="mt-12 flex flex-col gap-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
        >
          <motion.div 
            className="flex items-center gap-6 glass-panel px-8 py-4 rounded-full"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.6, duration: 0.8 }}
          >
            <div className="w-3 h-3 rounded-full bg-primary animate-pulse" />
            <p className="text-xl md:text-2xl text-white font-medium">The fastest-growing continent</p>
          </motion.div>

          <motion.div 
            className="flex items-center gap-6 glass-panel px-8 py-4 rounded-full"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.8, duration: 0.8 }}
          >
            <div className="w-3 h-3 rounded-full bg-accent animate-pulse" />
            <p className="text-xl md:text-2xl text-white font-medium">100% Mobile-first ecosystem</p>
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}