import { motion } from 'framer-motion';

export function Scene5() {
  return (
    <motion.div 
      className="absolute inset-0 flex items-center justify-center px-[10vw]"
      initial={{ opacity: 0, filter: 'blur(20px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 1 }}
    >
      <div className="flex w-full items-center justify-between">
        <div className="w-1/2 z-10 relative">
          <motion.div 
            className="absolute -inset-20 bg-brand/20 blur-[100px] rounded-full"
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          />
          <motion.h2 
            className="text-6xl font-bold text-white mb-6 relative z-10"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
          >
            AI Voice Campaigns
          </motion.h2>
          <motion.p 
            className="text-3xl text-violet-300 font-light mb-8 relative z-10"
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.6 }}
          >
            Human-quality voice calls. At infinite scale.
          </motion.p>
          
          <motion.div 
            className="flex gap-4 items-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
          >
            <div className="px-6 py-2 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-200">ElevenLabs TTS</div>
            <div className="text-white/30">+</div>
            <div className="px-6 py-2 rounded-full border border-blue-500/30 bg-blue-500/10 text-blue-200">Twilio Integrated</div>
          </motion.div>
        </div>
        
        <div className="w-1/2 flex justify-end relative h-[60vh] items-center">
          {/* Audio Visualizer rings */}
          <div className="relative w-96 h-96 flex items-center justify-center">
            {[1, 2, 3].map((ring) => (
              <motion.div 
                key={ring}
                className="absolute border border-brand/40 rounded-full"
                style={{ width: `${ring * 30}%`, height: `${ring * 30}%` }}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: [1, 1.1, 1], opacity: [0, 0.8, 0] }}
                transition={{ 
                  delay: ring * 0.2, 
                  duration: 2, 
                  repeat: Infinity,
                  ease: "easeInOut" 
                }}
              />
            ))}
            <motion.div 
              className="w-32 h-32 bg-gradient-to-br from-violet-600 to-fuchsia-600 rounded-full flex items-center justify-center shadow-[0_0_50px_rgba(139,92,246,0.6)] z-10"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 1, type: "spring", bounce: 0.5 }}
            >
              <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z" />
              </svg>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
