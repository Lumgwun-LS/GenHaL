import { motion } from 'framer-motion';

export default function Scene5() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center z-50 bg-transparent"
      initial={{ opacity: 0, scale: 1.1 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 1.0 }}
    >
      <div className="absolute inset-0 -z-10">
        <motion.img
          src={`${import.meta.env.BASE_URL}images/dashboard.jpg`}
          className="w-full h-full object-cover opacity-20 filter blur-[10px]"
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          transition={{ duration: 4, ease: "easeOut" }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#05050A] via-[#05050A]/80 to-[#05050A]/90" />
      </div>

      <motion.div
        className="w-[8vw] h-[8vw] mb-[3vh] rounded-[2vw] overflow-hidden shadow-[0_0_50px_rgba(138,43,226,0.4)] border border-white/10"
        initial={{ scale: 0, rotate: 90 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ delay: 0.5, type: "spring", stiffness: 100 }}
      >
        <img
          src={`${import.meta.env.BASE_URL}images/awajimaa-logo.jpg`}
          alt="Awajimaa"
          className="w-full h-full object-cover"
        />
      </motion.div>

      <motion.h1
        className="text-[5.5vw] font-display font-bold tracking-tight mb-[2vh]"
        initial={{ opacity: 0, y: '3vh' }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 0.8 }}
      >
        Scale Faster.
      </motion.h1>

      <motion.p
        className="text-[1.75vw] text-gray-400 max-w-[45vw] text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.8 }}
      >
        Everything you need. One dashboard. <br/>
        <span className="text-white font-semibold mt-[1vh] inline-block">Welcome to Awajimaa VendorHub.</span>
      </motion.p>
    </motion.div>
  );
}
