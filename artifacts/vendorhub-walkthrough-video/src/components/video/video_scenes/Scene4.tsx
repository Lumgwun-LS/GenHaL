import { motion } from 'framer-motion';

export default function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-[10vw] z-40 bg-[#05050A]"
      initial={{ y: '100vh' }}
      animate={{ y: 0 }}
      exit={{ y: '-100vh', opacity: 0 }}
      transition={{ duration: 0.9, ease: [0.7, 0, 0.3, 1] }}
    >
      <div className="w-[40vw] flex justify-center items-center relative h-[70vh]">
        <motion.div
          className="relative w-[22vw] h-[55vh] rounded-[2vw] border-2 border-white/10 glass-panel flex flex-col overflow-hidden bg-[#05050A]/50 backdrop-blur-xl"
          initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ delay: 0.8, type: "spring", stiffness: 90 }}
        >
          <div className="p-[1.5vw] border-b border-white/5 flex items-center justify-between bg-white/5">
            <div className="font-semibold text-[1.25vw]">Active Campaign</div>
            <div className="w-[0.75vw] h-[0.75vw] rounded-full bg-green-400 animate-pulse"></div>
          </div>
          <div className="p-[1.5vw] flex flex-col gap-[2vh] flex-1">
            <motion.div
              className="bg-white/5 rounded-[1vw] p-[1vw] border border-white/5"
              initial={{ opacity: 0, x: '-2vw' }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.2 }}
            >
              <div className="text-[0.8vw] text-gray-400 mb-[1vh]">AI Voice Call (Twilio)</div>
              <div className="flex items-center gap-[1vw]">
                <div className="w-[3vw] h-[3vw] rounded-full bg-[#8A2BE2]/20 flex items-center justify-center text-[1.5vw] shadow-[0_0_15px_rgba(138,43,226,0.3)]">
                  🎙️
                </div>
                <div className="flex-1">
                  <div className="h-[0.5vh] w-full bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className="h-full bg-[#8A2BE2]"
                      initial={{ width: "0%" }}
                      animate={{ width: "100%" }}
                      transition={{ delay: 1.5, duration: 2, repeat: Infinity, ease: "linear" }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              className="bg-[#00E5FF]/10 rounded-[1vw] p-[1vw] border border-[#00E5FF]/20 self-end w-[85%]"
              initial={{ opacity: 0, x: '2vw' }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 1.8 }}
            >
              <div className="text-[0.8vw] text-[#00E5FF] mb-[1vh] font-medium">SMS Delivered</div>
              <div className="h-[0.75vh] w-[75%] bg-[#00E5FF]/40 rounded mb-[1vh]"></div>
              <div className="h-[0.75vh] w-[50%] bg-[#00E5FF]/40 rounded"></div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      <div className="w-[40vw] flex flex-col justify-center pl-[2vw]">
        <motion.h2
          className="text-[4vw] font-display font-bold leading-tight mb-[3vh]"
          initial={{ opacity: 0, y: '4vh' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.8 }}
        >
          Reach Customers <br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#8A2BE2] to-[#00E5FF]">
            Anywhere.
          </span>
        </motion.h2>
        <motion.p
          className="text-[1.25vw] text-gray-300 max-w-[35vw] leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
        >
          Launch automated AI voice calls, SMS sequences, and email campaigns that convert automatically.
        </motion.p>
      </div>
    </motion.div>
  );
}
