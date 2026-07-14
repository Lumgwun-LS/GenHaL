import { motion } from 'framer-motion';

export default function Scene1() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-10 w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.1, filter: "blur(10px)" }}
      transition={{ duration: 0.8 }}
    >
      <div className="w-full flex flex-col items-center text-center z-20 mb-[4vh] mt-[-2vh]">
        <motion.h1
          className="text-[5vw] font-display font-bold tracking-tight mb-[2vh] text-white"
          initial={{ opacity: 0, y: '5vh' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        >
          Awajimaa Biz Suite
        </motion.h1>
        <motion.p
          className="text-[1.5vw] text-gray-300 font-medium tracking-wide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          Your entire business on one platform.
        </motion.p>
      </div>

      <motion.div
        className="absolute bottom-[-15vh] left-[15vw] w-[70vw] h-[55vh] rounded-[2vw] overflow-hidden border border-white/10 shadow-[0_0_100px_rgba(138,43,226,0.25)]"
        style={{ transformPerspective: 1000 }}
        initial={{ opacity: 0, y: '20vh', rotateX: 25 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ delay: 0.5, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/dashboard.jpg`}
          alt="Dashboard"
          className="w-full h-full object-cover"
        />
      </motion.div>
    </motion.div>
  );
}
