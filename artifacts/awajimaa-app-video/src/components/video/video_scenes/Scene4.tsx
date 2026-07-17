import { motion } from 'framer-motion';

export const Scene4 = () => {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center text-center px-12 md:px-24 z-20"
      initial={{ opacity: 0, rotateX: 90 }}
      animate={{ opacity: 1, rotateX: 0 }}
      exit={{ opacity: 0, scale: 2, filter: 'blur(20px)' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      style={{ perspective: 1000 }}
    >
      <motion.div
        className="inline-block px-4 py-1 mb-8 border border-secondary text-secondary font-bold tracking-widest text-sm uppercase bg-secondary/10 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        04 // Network
      </motion.div>
      
      <motion.h2 
        className="font-display font-medium text-4xl md:text-7xl text-white mb-6 leading-tight max-w-5xl"
      >
        <motion.span 
          className="inline-block"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          Connecting hospitals.
        </motion.span>{' '}
        <motion.span 
          className="inline-block text-secondary font-bold"
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          Real-time specialists.
        </motion.span>
      </motion.h2>
      
      <motion.div 
        className="flex gap-1 mt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
      >
        {[...Array(5)].map((_, i) => (
          <motion.div 
            key={i}
            className="w-16 h-1 bg-secondary"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 1 + i * 0.1, duration: 0.4 }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
};