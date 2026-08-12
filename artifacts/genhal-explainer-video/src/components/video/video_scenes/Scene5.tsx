import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function Scene5() {
  const [phase, setPhase] = useState(0);
  const [cipherText, setCipherText] = useState('****************');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 800);
    const t2 = setTimeout(() => setPhase(2), 2000);
    const t3 = setTimeout(() => setPhase(3), 3200);
    
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  useEffect(() => {
    if (phase >= 2) {
      let iter = 0;
      const target = 'FAMILY WEALTH   ';
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
      const interval = setInterval(() => {
        iter++;
        setCipherText(prev => 
          target.split('').map((char, index) => {
            if (char === ' ') return ' ';
            if (index < iter / 3) return char;
            return chars[Math.floor(Math.random() * chars.length)];
          }).join('')
        );
        if (iter > target.length * 3) clearInterval(interval);
      }, 50);
      return () => clearInterval(interval);
    }
  }, [phase]);

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0a0705]">
      {/* Background radial highlight */}
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          background: 'radial-gradient(circle at 50% 50%, rgba(150, 86, 15, 0.15) 0%, transparent 60%)'
        }}
      />

      <div className="relative z-10 text-center w-full max-w-[70vw]">
        <motion.div
          className="inline-block px-[2vw] py-[1vh] border border-[#96560F]/40 bg-[#96560F]/10 rounded-sm mb-[4vh] font-mono text-[2vh] text-[#96560F] tracking-[0.2em]"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8 }}
        >
          AES-256 ENCRYPTED
        </motion.div>

        <motion.h2
          className="font-display text-[7vh] text-[#F5F5F0] leading-[1.1] mb-[4vh]"
          initial={{ opacity: 0, y: 30 }}
          animate={phase >= 1 ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        >
          Family Wills &<br />Succession
        </motion.h2>

        {/* Encrypted text reveal */}
        <motion.div
          className="h-[10vh] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={phase >= 2 ? { opacity: 1 } : { opacity: 0 }}
        >
          <div className="font-mono text-[5vh] text-[#96560F] tracking-[0.3em] font-light">
            {cipherText}
          </div>
        </motion.div>

        <motion.p
          className="text-[3vh] text-[#F5F5F0]/60 font-body font-light mt-[2vh]"
          initial={{ opacity: 0, y: 20 }}
          animate={phase >= 3 ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 1 }}
        >
          Secure and protected generational wealth transfer.
        </motion.p>
      </div>
    </div>
  );
}