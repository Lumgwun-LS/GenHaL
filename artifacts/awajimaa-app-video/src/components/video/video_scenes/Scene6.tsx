import { motion } from 'framer-motion';

export const Scene6 = () => {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-background"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 1 }}
    >
      <motion.div 
        className="text-center relative z-10"
        initial={{ y: 50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3, duration: 1, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.div
          className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-primary mx-auto flex items-center justify-center mb-8"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.6, type: 'spring', bounce: 0.5 }}
        >
          <span className="font-display font-bold text-5xl md:text-6xl text-white">A</span>
        </motion.div>
        
        <h1 className="font-display font-black text-6xl md:text-8xl tracking-tighter text-white mb-6">
          AWAJIMAA
        </h1>
        
        <motion.p 
          className="text-2xl md:text-4xl font-light text-muted-foreground tracking-wide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
        >
          <span className="text-white font-medium">Protecting</span> Africa.<br/>
          <span className="text-primary font-medium">Empowering</span> Citizens.
        </motion.p>
      </motion.div>
      
      {/* Search mock */}
      <motion.div 
        className="absolute bottom-16 w-full max-w-md mx-auto"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.5, duration: 0.8 }}
      >
        <div className="bg-white/10 border border-white/20 rounded-full px-6 py-4 flex items-center justify-between backdrop-blur-md">
          <span className="text-white/60 font-medium">Available now...</span>
          <div className="flex gap-2">
            <div className="w-8 h-8 rounded-full bg-white/20" />
            <div className="w-8 h-8 rounded-full bg-white/20" />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};