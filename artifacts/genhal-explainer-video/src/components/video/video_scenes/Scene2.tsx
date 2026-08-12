import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function Scene2() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 1500);
    const t2 = setTimeout(() => setPhase(2), 3500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="absolute inset-0 flex items-center justify-center font-body">
      {/* Background tree nodes */}
      <svg className="absolute inset-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
        <motion.path
          d="M50vw,70vh C50vw,50vh 30vw,50vh 30vw,30vh"
          fill="none"
          stroke="#8F2A08"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.3 }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
        <motion.path
          d="M50vw,70vh C50vw,50vh 70vw,50vh 70vw,30vh"
          fill="none"
          stroke="#96560F"
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.3 }}
          transition={{ duration: 2, delay: 0.5, ease: "easeInOut" }}
        />
        <motion.path
          d="M30vw,30vh C30vw,20vh 20vw,20vh 20vw,10vh"
          fill="none"
          stroke="#8F2A08"
          strokeWidth="1.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.15 }}
          transition={{ duration: 2, delay: 1, ease: "easeInOut" }}
        />
        <motion.path
          d="M70vw,30vh C70vw,20vh 80vw,20vh 80vw,10vh"
          fill="none"
          stroke="#96560F"
          strokeWidth="1.5"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 0.15 }}
          transition={{ duration: 2, delay: 1.5, ease: "easeInOut" }}
        />
      </svg>

      <div className="relative z-10 w-full h-full flex flex-col justify-center px-[10vw]">
        <motion.div
          className="absolute left-[10vw]"
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: phase >= 0 ? 1 : 0 }}
          exit={{ x: -100, opacity: 0 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="font-display text-[7vh] text-[#F5F5F0] leading-none mb-[2vh]">
            Genealogy &<br />Family Trees
          </h2>
          
          <motion.div
            className="flex items-center gap-[2vw] mt-[4vh]"
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.8 }}
          >
            <div className="w-[4vh] h-[4vh] rounded-full border border-[#8F2A08] flex items-center justify-center text-[#8F2A08] text-[2vh]">1</div>
            <p className="text-[3vh] text-[#F5F5F0]/70 font-light">Trace your ancient lineage.</p>
          </motion.div>

          <motion.div
            className="flex items-center gap-[2vw] mt-[2vh]"
            initial={{ opacity: 0, y: 20 }}
            animate={phase >= 2 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.8 }}
          >
            <div className="w-[4vh] h-[4vh] rounded-full border border-[#96560F] flex items-center justify-center text-[#96560F] text-[2vh]">2</div>
            <p className="text-[3vh] text-[#F5F5F0]/70 font-light">Document generations.</p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}