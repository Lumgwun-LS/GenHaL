import { motion } from 'framer-motion';

export default function Scene1() {
  return (
    <div className="absolute inset-0 flex items-center justify-center font-display">
      {/* Deep ambient background element */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0, scale: 1.1 }}
        animate={{ opacity: 0.2, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 4, ease: 'easeOut' }}
        style={{
          background: 'radial-gradient(circle at center, #8F2A08 0%, transparent 60%)'
        }}
      />

      <div className="relative z-10 text-center flex flex-col items-center">
        <div className="overflow-hidden mb-[1vh]">
          <motion.h1
            className="text-[5vh] text-[#F5F5F0]/80 tracking-[0.15em] uppercase"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '-50%', opacity: 0, filter: 'blur(10px)' }}
            transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          >
            Your history
          </motion.h1>
        </div>
        <div className="overflow-hidden">
          <motion.h2
            className="text-[9vh] text-terracotta-gradient tracking-tight leading-none"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: '0%', opacity: 1 }}
            exit={{ y: '-50%', opacity: 0, filter: 'blur(10px)' }}
            transition={{ duration: 1.2, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            Is Fading.
          </motion.h2>
        </div>
      </div>
    </div>
  );
}