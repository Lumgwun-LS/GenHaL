import { motion } from 'framer-motion';

export function Scene1() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div 
        className="relative w-[35vw] h-[35vw] max-w-[500px] max-h-[500px] mb-8"
        initial={{ opacity: 0, y: 40, rotateX: 20 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ delay: 0.3, duration: 1.5, ease: "easeOut" }}
      >
        <img 
          src={`${import.meta.env.BASE_URL}images/brain.png`} 
          alt="Brain" 
          className="w-full h-full object-contain"
        />
      </motion.div>
      
      <motion.div className="text-center z-10 relative">
        <motion.h1 
          className="text-7xl font-bold tracking-tighter text-white mb-4 glow-text"
          initial={{ opacity: 0, y: 20, clipPath: 'inset(100% 0 0 0)' }}
          animate={{ opacity: 1, y: 0, clipPath: 'inset(0% 0 0 0)' }}
          transition={{ delay: 0.8, duration: 0.8, ease: "backOut" }}
        >
          AWAJIMAA <span className="text-gradient">AI</span>
        </motion.h1>
        
        <motion.p 
          className="text-3xl text-violet-200 tracking-wide font-light"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.4, duration: 0.8 }}
        >
          The AI Brain of African Business
        </motion.p>
      </motion.div>
    </motion.div>
  );
}
