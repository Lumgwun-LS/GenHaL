import { motion } from 'framer-motion';

export default function Scene2() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-between px-[10vw] z-20 bg-[#05050A]"
      initial={{ clipPath: 'polygon(0 100%, 100% 100%, 100% 100%, 0 100%)' }}
      animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' }}
      exit={{ opacity: 0, scale: 0.95, filter: "blur(10px)" }}
      transition={{ duration: 1.0, ease: [0.7, 0, 0.3, 1] }}
    >
      <div className="w-[40vw] flex flex-col justify-center">
        <motion.h2
          className="text-[4vw] font-display font-bold leading-tight mb-[3vh]"
          initial={{ opacity: 0, x: '-5vw' }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8, duration: 0.8, ease: "easeOut" }}
        >
          Connect <br/> <span className="text-[#00E5FF]">Everything.</span>
        </motion.h2>
        <motion.p
          className="text-[1.25vw] text-gray-300 max-w-[30vw] leading-relaxed"
          initial={{ opacity: 0, x: '-3vw' }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 1.0, duration: 0.8 }}
        >
          Sync Facebook, Instagram, and LinkedIn. Manage all your social channels from one unified dashboard.
        </motion.p>
      </div>

      <div className="w-[40vw] flex justify-center items-center relative h-[60vh]">
        <motion.img
          src={`${import.meta.env.BASE_URL}images/social_icons.png`}
          alt="Social Icons"
          className="w-[30vw] object-contain drop-shadow-[0_0_50px_rgba(0,229,255,0.2)]"
          initial={{ opacity: 0, scale: 0.5, y: '5vh' }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.9, type: "spring", stiffness: 100, damping: 20 }}
        />
      </div>
    </motion.div>
  );
}
