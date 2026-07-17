import { motion } from 'framer-motion';

export const Scene2 = () => {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-end px-12 md:px-24 z-20"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(20px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="max-w-3xl text-right relative z-10">
        <motion.div
          className="inline-block px-4 py-1 mb-6 border border-secondary text-secondary font-bold tracking-widest text-sm uppercase bg-secondary/10 backdrop-blur-sm ml-auto"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          02 // Tele-Health
        </motion.div>
        
        <motion.h2 
          className="font-display font-bold text-6xl md:text-8xl leading-none text-white mb-2"
          initial={{ opacity: 0, filter: 'blur(10px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          VIRTUAL
        </motion.h2>
        
        <motion.h2 
          className="font-display font-bold text-6xl md:text-8xl leading-none text-secondary"
          initial={{ opacity: 0, filter: 'blur(10px)', x: 50 }}
          animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
          transition={{ delay: 0.7, duration: 0.8 }}
        >
          CARE. ANYWHERE.
        </motion.h2>
        
        <motion.p
          className="mt-8 text-xl md:text-3xl text-muted-foreground font-light ml-auto max-w-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.8 }}
        >
          Instant doctor consultations across the continent, breaking down barriers to healthcare.
        </motion.p>
      </div>

      {/* Cross accent */}
      <motion.div 
        className="absolute left-1/4 top-1/2 -translate-y-1/2 w-48 h-48 opacity-20"
        initial={{ rotate: -45, scale: 0 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ delay: 0.4, duration: 1, type: 'spring' }}
      >
        <div className="absolute top-1/2 left-0 w-full h-4 bg-secondary -translate-y-1/2 rounded" />
        <div className="absolute left-1/2 top-0 h-full w-4 bg-secondary -translate-x-1/2 rounded" />
      </motion.div>
    </motion.div>
  );
};