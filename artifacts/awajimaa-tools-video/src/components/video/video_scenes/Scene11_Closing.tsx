// @ts-nocheck
import { motion } from 'framer-motion';

export default function Scene11_Closing() {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { duration: 1.5, staggerChildren: 0.5, delayChildren: 0.5 }
    },
    exit: { 
      opacity: 0,
      scale: 1.1,
      filter: 'blur(20px)',
      transition: { duration: 1.5, ease: 'easeInOut' }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20, filter: 'blur(10px)' },
    visible: { 
      opacity: 1, 
      y: 0, 
      filter: 'blur(0px)',
      transition: { duration: 2, ease: [0.16, 1, 0.3, 1] } 
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
      <div className="absolute inset-0 bg-bg-dark" />
      
      {/* Global Grain/Noise overlay */}
      <div 
        className="absolute inset-0 opacity-[0.05] pointer-events-none mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
        }}
      />

      {/* Cinematic flare */}
      <motion.div
        className="absolute w-[80vw] h-[80vw] bg-primary rounded-full blur-[200px] opacity-20 pointer-events-none"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.2 }}
        transition={{ duration: 4, ease: 'easeOut' }}
      />

      <div className="relative z-20 flex flex-col items-center justify-center gap-10 pb-[10vh]">
        <motion.div variants={itemVariants} className="overflow-hidden rounded-sm mix-blend-screen">
          <img 
            src={`${import.meta.env.BASE_URL}images/logo.jpg`} 
            alt="Awajimaa Logo" 
            className="w-24 h-24 object-contain"
          />
        </motion.div>
        
        <div className="flex flex-col items-center gap-2">
          <motion.h2 
            variants={itemVariants}
            className="font-display text-5xl md:text-7xl font-medium text-text-primary tracking-wide text-center"
          >
            Your creativity.
          </motion.h2>
          <motion.h2 
            variants={itemVariants}
            className="font-display text-5xl md:text-7xl font-bold text-primary tracking-wider uppercase text-center"
          >
            Amplified.
          </motion.h2>
        </div>
      </div>
    </motion.div>
  );
}