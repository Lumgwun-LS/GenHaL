import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

export const Scene1 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000),
      setTimeout(() => setPhase(4), 5000), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 pl-[8vw] flex flex-col justify-center"
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -100, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="max-w-3xl relative z-20">
        <div className="overflow-hidden mb-4">
          <motion.p
            className="text-accent font-bold tracking-widest uppercase text-lg"
            initial={{ y: 50, opacity: 0 }}
            animate={
              phase >= 4 ? { y: -30, opacity: 0 } :
              phase >= 1 ? { y: 0, opacity: 1 } :
              { y: 50, opacity: 0 }
            }
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            Command Center
          </motion.p>
        </div>
        
        <div className="overflow-hidden mb-6">
          <motion.h2
            className="text-6xl md:text-7xl font-display font-bold text-white leading-tight"
            initial={{ y: 100, opacity: 0 }}
            animate={
              phase >= 4 ? { y: -50, opacity: 0 } :
              phase >= 2 ? { y: 0, opacity: 1 } :
              { y: 100, opacity: 0 }
            }
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            One dashboard.<br/>
            <span className="text-gradient-primary">Total control.</span>
          </motion.h2>
        </div>

        <motion.p
          className="text-2xl text-text-secondary max-w-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={
            phase >= 4 ? { opacity: 0, y: -20 } :
            phase >= 3 ? { opacity: 1, y: 0 } :
            { opacity: 0, y: 20 }
          }
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          Manage inventory, track orders, and monitor your growth without switching tabs.
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
          className="absolute -left-12 top-[20%] w-64 h-24 bg-bg-muted/90 backdrop-blur-xl border border-white/10 rounded-xl p-4 flex items-center gap-4 shadow-xl"
          initial={{ x: -50, opacity: 0, scale: 0.9 }}
          animate={
            phase >= 4 ? { x: -100, opacity: 0 } :
            phase >= 2 ? { x: 0, opacity: 1, scale: 1 } :
            { x: -50, opacity: 0, scale: 0.9 }
          }
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: phase === 2 ? 0.3 : 0 }}
        >
          <div className="w-12 h-12 rounded-full bg-success/20 flex items-center justify-center">
            <div className="w-4 h-4 rounded-sm bg-success" />
          </div>
          <div>
            <p className="text-text-secondary text-sm font-medium">New Order</p>
            <p className="text-white font-bold text-lg">+$124.50</p>
          </div>
        </motion.div>

        <motion.div
          className="absolute -bottom-8 left-[10%] w-56 h-32 bg-bg-muted/90 backdrop-blur-xl border border-white/10 rounded-xl p-5 shadow-xl"
          initial={{ y: 50, opacity: 0, scale: 0.9 }}
          animate={
            phase >= 4 ? { y: 100, opacity: 0 } :
            phase >= 3 ? { y: 0, opacity: 1, scale: 1 } :
            { y: 50, opacity: 0, scale: 0.9 }
          }
          transition={{ type: "spring", stiffness: 300, damping: 20, delay: phase === 3 ? 0.2 : 0 }}
        >
          <p className="text-text-secondary text-sm font-medium mb-2">Inventory Alert</p>
          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden mb-3">
            <div className="w-3/4 h-full bg-warning rounded-full" />
          </div>
          <p className="text-white font-semibold text-sm">Low stock: Wireless Earbuds</p>
        </motion.div>
      </div>
    </motion.div>
  );
};
