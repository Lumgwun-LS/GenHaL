import { motion } from 'framer-motion';

export const Scene5 = () => {
  return (
    <motion.div
      className="absolute inset-0 flex items-center px-12 md:px-24 z-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, x: 200 }}
      transition={{ duration: 0.8 }}
    >
      <div className="max-w-4xl relative z-10">
        <motion.div
          className="inline-block px-4 py-1 mb-6 border border-primary text-primary font-bold tracking-widest text-sm uppercase bg-black/50 backdrop-blur-sm"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          05 // Environment
        </motion.div>
        
        <motion.h2 
          className="font-display font-black text-6xl md:text-8xl leading-[0.9] text-white tracking-tight mb-8"
        >
          <motion.span 
            className="block"
            initial={{ opacity: 0, filter: 'blur(10px)', y: 20 }}
            animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            REPORT
          </motion.span>
          <motion.span 
            className="block text-primary"
            initial={{ opacity: 0, filter: 'blur(10px)', y: 20 }}
            animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            OIL SPILLS
          </motion.span>
        </motion.h2>
        
        <motion.p
          className="text-xl md:text-3xl text-white/80 font-light max-w-2xl bg-black/40 p-6 rounded-lg backdrop-blur-md border border-white/10"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          Citizens act as the first line of defense. Report environmental emergencies to trigger immediate government response.
        </motion.p>
      </div>
    </motion.div>
  );
};