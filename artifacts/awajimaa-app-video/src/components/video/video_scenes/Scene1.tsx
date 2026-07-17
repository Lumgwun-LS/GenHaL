import { motion } from 'framer-motion';

export const Scene1 = () => {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col justify-center px-12 md:px-24 z-20"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="max-w-4xl relative z-10">
        <motion.div
          className="inline-block px-4 py-1 mb-6 border border-primary text-primary font-bold tracking-widest text-sm uppercase bg-primary/10 backdrop-blur-sm"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 'auto', opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          01 // Emergency
        </motion.div>
        
        <div className="overflow-hidden mb-4">
          <motion.h2 
            className="font-display font-bold text-5xl md:text-8xl leading-none text-white"
            initial={{ y: '100%' }}
            animate={{ y: '0%' }}
            transition={{ delay: 0.4, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            EVERY SECOND
          </motion.h2>
        </div>
        
        <div className="overflow-hidden">
          <motion.h2 
            className="font-display font-bold text-5xl md:text-8xl leading-none text-primary"
            initial={{ y: '100%' }}
            animate={{ y: '0%' }}
            transition={{ delay: 0.5, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            COUNTS
          </motion.h2>
        </div>
        
        <motion.p
          className="mt-8 text-xl md:text-3xl text-muted-foreground font-light max-w-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          Instantly connecting citizens to rapid emergency services when it matters most.
        </motion.p>
      </div>
      
      {/* Abstract UI Elements */}
      <motion.div 
        className="absolute top-1/4 right-1/4 w-[30vw] h-[30vw] border-[1px] border-white/5 rounded-full"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 2, opacity: 1 }}
        transition={{ delay: 0.2, duration: 3, ease: 'linear' }}
      />
      <motion.div 
        className="absolute bottom-1/4 right-1/3 w-[20vw] h-[20vw] border-[1px] border-primary/20 rounded-full"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1.5, opacity: 1 }}
        transition={{ delay: 0.4, duration: 2.5, ease: 'easeOut' }}
      />
    </motion.div>
  );
};