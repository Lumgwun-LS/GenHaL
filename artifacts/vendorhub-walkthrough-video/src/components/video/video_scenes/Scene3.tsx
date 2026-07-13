import { motion } from 'framer-motion';

export default function Scene3() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-30 bg-transparent"
      initial={{ clipPath: 'circle(0% at 50% 50%)' }}
      animate={{ clipPath: 'circle(150% at 50% 50%)' }}
      exit={{ opacity: 0, scale: 1.05 }}
      transition={{ duration: 1.2, ease: [0.7, 0, 0.3, 1] }}
    >
      <div className="absolute inset-0 bg-[#05050A]/80 backdrop-blur-md -z-10" />

      <div className="text-center z-10 mb-[6vh] mt-[5vh]">
        <motion.h2
          className="text-[3.5vw] font-display font-bold mb-[2vh]"
          initial={{ opacity: 0, y: '-3vh' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          AI-Powered <span className="text-[#8A2BE2]">Marketing</span>
        </motion.h2>
        <motion.p
          className="text-[1.25vw] text-gray-300"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.0, duration: 0.8 }}
        >
          Auto-generate captions, images, and schedules.
        </motion.p>
      </div>

      <div className="relative w-full max-w-[60vw] flex items-center justify-center h-[50vh]">
        <motion.img
          src={`${import.meta.env.BASE_URL}images/ai_brain.png`}
          alt="AI Core"
          className="w-[20vw] h-[20vw] object-contain absolute z-20 drop-shadow-[0_0_80px_rgba(138,43,226,0.6)]"
          initial={{ scale: 0, rotate: -45 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 1.2, type: "spring", stiffness: 80, damping: 15 }}
        />

        <motion.div
          className="glass-panel absolute left-[5%] top-[5%] p-[1vw] rounded-[1vw] w-[18vw] shadow-2xl z-10"
          initial={{ opacity: 0, x: '5vw', scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ delay: 1.6, type: "spring", stiffness: 100 }}
        >
          <div className="w-full h-[6vh] bg-white/10 rounded mb-[1vh]"></div>
          <div className="h-[1vh] w-[75%] bg-white/20 rounded mb-[1vh]"></div>
          <div className="h-[1vh] w-[50%] bg-white/20 rounded"></div>
        </motion.div>

        <motion.div
          className="glass-panel absolute right-[5%] bottom-[5%] p-[1vw] rounded-[1vw] w-[18vw] shadow-2xl z-10"
          initial={{ opacity: 0, x: '-5vw', scale: 0.8 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ delay: 1.9, type: "spring", stiffness: 100 }}
        >
          <div className="w-full h-[8vh] bg-white/10 rounded mb-[1vh]"></div>
          <div className="h-[1vh] w-[83%] bg-white/20 rounded"></div>
        </motion.div>

        <motion.div
          className="glass-panel absolute left-[20%] bottom-[0%] p-[0.75vw] rounded-[1vw] w-[14vw] shadow-2xl z-30"
          initial={{ opacity: 0, y: '3vh' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.2, type: "spring", stiffness: 120 }}
        >
          <div className="flex items-center gap-[1vw]">
            <div className="w-[2.5vw] h-[2.5vw] rounded-full bg-[#00E5FF]/20 flex items-center justify-center">
              <div className="w-[1vw] h-[1vw] rounded-full bg-[#00E5FF]"></div>
            </div>
            <div className="text-[1vw] font-medium">Post Scheduled!</div>
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
