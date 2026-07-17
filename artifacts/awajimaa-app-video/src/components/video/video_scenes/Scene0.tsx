import { motion } from 'framer-motion';

export const Scene0 = () => {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center z-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="text-center">
        <motion.div
          className="w-32 h-32 md:w-48 md:h-48 rounded-full bg-primary mb-8 mx-auto flex items-center justify-center relative"
          initial={{ scale: 0, rotate: -90 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ duration: 1.2, type: 'spring', bounce: 0.4 }}
        >
          <div className="absolute inset-0 rounded-full border-4 border-primary opacity-50 animate-ping" style={{ animationDuration: '2s' }} />
          <span className="font-display font-bold text-6xl md:text-8xl text-white">A</span>
        </motion.div>
        
        <motion.h1 
          className="font-display font-black text-6xl md:text-9xl tracking-tighter"
          initial={{ y: 50, opacity: 0, clipPath: 'inset(100% 0 0 0)' }}
          animate={{ y: 0, opacity: 1, clipPath: 'inset(0% 0 0 0)' }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          AWAJIMAA
        </motion.h1>
        
        <motion.div
          className="flex items-center justify-center gap-4 mt-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
        >
          <div className="h-[2px] w-12 bg-primary" />
          <p className="uppercase tracking-[0.3em] font-medium text-primary text-sm md:text-xl">
            Civic Emergency Response
          </p>
          <div className="h-[2px] w-12 bg-primary" />
        </motion.div>
      </div>
    </motion.div>
  );
};