import { motion } from 'framer-motion';

export function Scene3() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-col items-center justify-center px-[10vw]"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.2, filter: 'blur(10px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        className="text-center mb-16"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
      >
        <h2 className="text-5xl font-bold text-white mb-4 tracking-tight">Multi-Platform Control</h2>
        <p className="text-2xl text-violet-300 font-light">Schedule & publish everywhere at once</p>
      </motion.div>

      <div className="w-full max-w-5xl h-[50vh] relative flex items-center justify-center">
        {/* Abstract Calendar UI */}
        <motion.div 
          className="absolute inset-0 bg-background/60 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 grid grid-cols-7 gap-4"
          initial={{ opacity: 0, rotateX: 45, y: 100 }}
          animate={{ opacity: 1, rotateX: 0, y: 0 }}
          transition={{ delay: 0.6, duration: 1.2, type: 'spring', bounce: 0.2 }}
        >
          {Array.from({ length: 14 }).map((_, i) => (
            <motion.div 
              key={i}
              className="bg-white/5 rounded-xl border border-white/5 relative overflow-hidden"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.8 + i * 0.05, duration: 0.4 }}
            >
              {(i === 3 || i === 5 || i === 8 || i === 11) && (
                <motion.div 
                  className="absolute inset-x-2 top-2 h-1/3 bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-md"
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ delay: 1.2 + i * 0.1, duration: 0.6 }}
                />
              )}
            </motion.div>
          ))}
        </motion.div>
        
        {/* Floating platform icons */}
        {[
          { color: 'bg-blue-600', x: -200, y: -50, delay: 1.5 },
          { color: 'bg-pink-600', x: -100, y: 100, delay: 1.7 },
          { color: 'bg-black border border-white/20', x: 100, y: -100, delay: 1.9 },
          { color: 'bg-blue-800', x: 200, y: 50, delay: 2.1 }
        ].map((platform, i) => (
          <motion.div
            key={i}
            className={`absolute w-16 h-16 rounded-2xl ${platform.color} shadow-[0_0_30px_rgba(255,255,255,0.2)] flex items-center justify-center`}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
            animate={{ opacity: 1, x: platform.x, y: platform.y, scale: 1 }}
            transition={{ delay: platform.delay, duration: 0.8, type: 'spring' }}
          >
            <div className="w-6 h-6 bg-white/80 rounded-full" />
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
