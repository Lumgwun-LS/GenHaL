import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export const Scene1 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 4800), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 pl-[12vw] flex flex-col justify-center"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="max-w-[38vw] relative z-20">
        <div className="overflow-hidden mb-[1vw]">
          <motion.p
            className="text-accent font-bold tracking-widest uppercase text-[1vw]"
            initial={{ y: 50, opacity: 0 }}
            animate={
              phase >= 4 ? { y: -30, opacity: 0 } :
              phase >= 1 ? { y: 0, opacity: 1 } :
              { y: 50, opacity: 0 }
            }
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            Awajimaa Biz Suite
          </motion.p>
        </div>
        
        <div className="overflow-hidden mb-[1.5vw]">
          <motion.h2
            className="text-[4vw] font-display font-bold text-white leading-tight"
            initial={{ y: 100, opacity: 0 }}
            animate={
              phase >= 4 ? { y: -50, opacity: 0 } :
              phase >= 2 ? { y: 0, opacity: 1 } :
              { y: 100, opacity: 0 }
            }
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            Total commerce.<br/>
            <span className="text-gradient-primary">Total control.</span>
          </motion.h2>
        </div>

        <motion.p
          className="text-[1.5vw] text-text-secondary max-w-[30vw]"
          initial={{ opacity: 0, y: 20 }}
          animate={
            phase >= 4 ? { opacity: 0, y: -20 } :
            phase >= 3 ? { opacity: 1, y: 0 } :
            { opacity: 0, y: 20 }
          }
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Manage inventory, run AI voice campaigns, and track multi-branch finances across the premier multivendor platform.
        </motion.p>
      </div>

      {/* Visual Composition - Right side */}
      <div className="absolute right-[5vw] top-1/2 -translate-y-1/2 w-[50vw] h-[70vh] pointer-events-none">
        {/* Main Dashboard Image */}
        <motion.div
          className="absolute inset-0 rounded-2xl overflow-hidden shadow-2xl border border-white/10"
          initial={{ scale: 0.8, opacity: 0, rotateY: 20, rotateX: 10 }}
          animate={
            phase >= 4 ? { scale: 1.2, opacity: 0, x: 200 } :
            phase >= 1 ? { scale: 1, opacity: 1, rotateY: -5, rotateX: 5 } :
            { scale: 0.8, opacity: 0, rotateY: 20, rotateX: 10 }
          }
          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformPerspective: 1000 }}
        >
          <img 
            src={`${import.meta.env.BASE_URL}images/vendor-dashboard.png`} 
            alt="Vendor Dashboard" 
            className="w-full h-full object-cover object-left"
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-bg-dark/80 via-transparent to-transparent" />
        </motion.div>

        {/* Floating UI Elements */}
        <motion.div
          className="absolute -left-[3vw] top-[20%] w-[16vw] h-[6vw] bg-bg-muted/90 backdrop-blur-xl border border-white/10 rounded-[1vw] p-[1vw] flex items-center gap-[1vw] shadow-xl"
          initial={{ x: -50, opacity: 0, scale: 0.9 }}
          animate={
            phase >= 4 ? { x: -100, opacity: 0 } :
            phase >= 2 ? { x: 0, opacity: 1, scale: 1 } :
            { x: -50, opacity: 0, scale: 0.9 }
          }
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: phase === 2 ? 0.3 : 0 }}
        >
          <div className="w-[3vw] h-[3vw] rounded-full bg-success/20 flex items-center justify-center">
            <div className="w-[1vw] h-[1vw] rounded-sm bg-success" />
          </div>
          <div>
            <p className="text-text-secondary text-[0.8vw] font-medium">New Order</p>
            <p className="text-white font-bold text-[1.2vw]">+$124.50</p>
          </div>
        </motion.div>

        <motion.div
          className="absolute -bottom-[2vw] left-[10%] w-[14vw] h-[8vw] bg-bg-muted/90 backdrop-blur-xl border border-white/10 rounded-[1vw] p-[1.2vw] shadow-xl"
          initial={{ y: 50, opacity: 0, scale: 0.9 }}
          animate={
            phase >= 4 ? { y: 100, opacity: 0 } :
            phase >= 3 ? { y: 0, opacity: 1, scale: 1 } :
            { y: 50, opacity: 0, scale: 0.9 }
          }
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: phase === 3 ? 0.2 : 0 }}
        >
          <p className="text-text-secondary text-[0.8vw] font-medium mb-[0.5vw]">Inventory Alert</p>
          <div className="w-full bg-white/10 h-[0.5vw] rounded-full overflow-hidden mb-[0.8vw]">
            <div className="w-3/4 h-full bg-warning rounded-full" />
          </div>
          <p className="text-white font-semibold text-[0.8vw]">Low stock: Wireless Earbuds</p>
        </motion.div>

        <motion.div
          className="absolute top-[10%] -right-[4vw] w-[15vw] bg-bg-muted/90 backdrop-blur-xl border border-white/10 rounded-[1vw] p-[1.2vw] shadow-xl"
          initial={{ x: 50, opacity: 0, scale: 0.9 }}
          animate={
            phase >= 4 ? { x: 100, opacity: 0 } :
            phase >= 3 ? { x: 0, opacity: 1, scale: 1 } :
            { x: 50, opacity: 0, scale: 0.9 }
          }
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: phase === 3 ? 0.4 : 0 }}
        >
          <div className="flex items-center gap-[0.8vw] mb-[0.6vw]">
            <div className="w-[1.8vw] h-[1.8vw] rounded-full bg-primary/20 flex items-center justify-center">
              <div className="w-[0.8vw] h-[0.8vw] rounded-full bg-primary" />
            </div>
            <p className="text-text-secondary text-[0.8vw] font-medium">Voice Campaign</p>
          </div>
          <p className="text-white font-semibold text-[0.9vw]">Calling 1,240 leads...</p>
        </motion.div>
      </div>
    </motion.div>
  );
};
