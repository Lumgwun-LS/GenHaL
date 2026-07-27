// @ts-nocheck
import { motion } from 'framer-motion';

export default function Scene00_Opening() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { duration: 1, staggerChildren: 0.2, delayChildren: 0.5 }
    },
    exit: { 
      opacity: 0,
      scale: 1.1,
      filter: 'blur(10px)',
      transition: { duration: 1.2, ease: [0.16, 1, 0.3, 1] }
    }
  };

  const textVariants = {
    hidden: { opacity: 0, y: 30, scale: 0.95, filter: 'blur(10px)' },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1, 
      filter: 'blur(0px)',
      transition: { duration: 1.5, ease: [0.16, 1, 0.3, 1] } 
    }
  };

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center z-20"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <div className="absolute inset-0 bg-black/40" />

      <motion.div 
        className="relative z-10 flex flex-col items-center justify-center gap-8"
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        transition={{ duration: 5, ease: 'easeOut' }}
      >
        <motion.div variants={textVariants} className="overflow-hidden rounded-sm mix-blend-screen">
          <img 
            src={`${import.meta.env.BASE_URL}images/logo.jpg`} 
            alt="Awajimaa Logo" 
            className="w-32 h-32 object-contain"
          />
        </motion.div>
        
        <div className="overflow-hidden py-2">
          <motion.h1 
            variants={textVariants}
            className="font-display text-7xl md:text-9xl text-text-primary tracking-widest uppercase text-center"
            style={{ textShadow: '0 10px 30px rgba(0,0,0,0.8)' }}
          >
            Awajimaa <span className="text-primary italic">AI</span>
          </motion.h1>
        </div>

        <motion.div 
          className="w-px h-16 bg-gradient-to-b from-primary/80 to-transparent mt-8"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 64, opacity: 1 }}
          transition={{ duration: 1.5, delay: 1.5, ease: 'easeInOut' }}
        />
      </motion.div>
    </motion.div>
  );
}