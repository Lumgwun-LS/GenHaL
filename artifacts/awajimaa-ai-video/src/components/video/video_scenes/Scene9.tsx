import { motion } from 'framer-motion';

export function Scene9() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1.5, ease: "easeInOut" }}
    >
      <div className="absolute inset-0 z-0 overflow-hidden flex items-center justify-center">
        <motion.div 
          className="w-[150vw] h-[150vw] bg-[radial-gradient(circle_at_center,hsl(var(--brand)/0.15)_0%,transparent_60%)] rounded-full"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <motion.div 
        className="relative z-10 flex flex-col items-center"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 1.2, ease: "easeOut" }}
      >
        <motion.h1 
          className="text-8xl font-bold tracking-tighter text-white mb-6 glow-text text-center"
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          transition={{ delay: 1.2, duration: 2, ease: "easeOut" }}
        >
          AWAJIMAA <span className="text-gradient">AI</span>
        </motion.h1>
        
        <motion.div 
          className="h-[1px] w-0 bg-gradient-to-r from-transparent via-white/50 to-transparent mb-6"
          animate={{ width: "100%" }}
          transition={{ delay: 1.8, duration: 1.5, ease: "easeInOut" }}
        />

        <motion.p 
          className="text-4xl text-white/90 font-light tracking-wide text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.2, duration: 1 }}
        >
          Run Everything. <span className="text-violet-400 font-medium">Powered by AI.</span>
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
