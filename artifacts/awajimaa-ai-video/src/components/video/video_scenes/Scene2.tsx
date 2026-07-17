import { motion } from 'framer-motion';

export function Scene2() {
  return (
    <motion.div 
      className="absolute inset-0 flex flex-row items-center justify-between px-[10vw]"
      initial={{ opacity: 0, x: '100vw' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-50vw', filter: 'blur(10px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="w-1/2 pr-12 z-10">
        <motion.h2 
          className="text-6xl font-bold text-white mb-6 leading-tight"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8 }}
        >
          <span className="text-gradient">AI-Powered</span><br />
          Content Engine
        </motion.h2>
        
        <div className="flex flex-col gap-6 mt-12">
          {[
            { title: 'AI Social Media Copy', delay: 0.8 },
            { title: 'Instant Image Generation', delay: 1.0 },
            { title: 'Multi-scene Video Campaigns', delay: 1.2 }
          ].map((item, i) => (
            <motion.div 
              key={i}
              className="flex items-center gap-4 glow-box bg-background/50 backdrop-blur-md p-4 rounded-xl border border-white/10"
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: item.delay, duration: 0.6, type: "spring", bounce: 0.4 }}
            >
              <div className="w-12 h-12 rounded-full bg-violet-600/30 flex items-center justify-center text-violet-300">
                ✨
              </div>
              <p className="text-2xl font-medium text-white/90">{item.title}</p>
            </motion.div>
          ))}
        </div>
      </div>
      
      <div className="w-1/2 relative h-[70vh] flex items-center justify-center">
        {/* Floating AI nodes / cards */}
        <motion.div 
          className="absolute w-64 h-80 bg-gradient-to-br from-violet-600/20 to-fuchsia-600/20 backdrop-blur-xl border border-white/20 rounded-2xl p-6"
          initial={{ opacity: 0, y: 100, rotateZ: -10 }}
          animate={{ opacity: 1, y: 0, rotateZ: -5 }}
          transition={{ delay: 1.2, duration: 1 }}
          style={{ transformOrigin: 'bottom left' }}
        >
          <div className="w-full h-32 bg-black/40 rounded-lg mb-4 animate-[pulse_3s_ease-in-out_infinite]"></div>
          <div className="w-3/4 h-4 bg-white/20 rounded mb-2"></div>
          <div className="w-1/2 h-4 bg-white/20 rounded"></div>
        </motion.div>
        
        <motion.div 
          className="absolute w-72 h-64 bg-gradient-to-br from-blue-600/20 to-violet-600/20 backdrop-blur-xl border border-white/20 rounded-2xl p-6 z-10"
          initial={{ opacity: 0, x: 100, rotateZ: 20 }}
          animate={{ opacity: 1, x: 20, rotateZ: 5 }}
          transition={{ delay: 1.5, duration: 1 }}
        >
          <div className="flex gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-blue-400/50"></div>
            <div className="flex flex-col gap-2 justify-center">
              <div className="w-24 h-2 bg-white/40 rounded"></div>
              <div className="w-16 h-2 bg-white/20 rounded"></div>
            </div>
          </div>
          <div className="w-full h-32 bg-white/10 rounded-lg"></div>
        </motion.div>
      </div>
    </motion.div>
  );
}
