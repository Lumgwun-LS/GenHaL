import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Share2, Sparkles, TrendingUp, Wallet, Building2, Package, Mic, Users } from 'lucide-react';

const FEATURES = [
  { icon: Share2, title: 'Unified Social', desc: 'Publish to all networks' },
  { icon: Sparkles, title: 'AI Studio', desc: 'Generate marketing content' },
  { icon: TrendingUp, title: 'Sales CRM', desc: 'Track every lead' },
  { icon: Wallet, title: 'Finance Suite', desc: 'Manage ledgers & expenses' },
  { icon: Building2, title: 'Branches', desc: 'Model physical locations' },
  { icon: Package, title: 'Inventory', desc: 'Real-time stock alerts' },
  { icon: Mic, title: 'Voice AI', desc: 'Automated voice campaigns' },
  { icon: Users, title: 'Multi-Vendor', desc: 'Manage multiple brands' },
];

export const Scene5 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 500),
      setTimeout(() => setPhase(2), 1200),
      setTimeout(() => setPhase(3), 2000), // features stagger in
      setTimeout(() => setPhase(4), 6800), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center pt-[5vh]"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="text-center z-20 mb-[4vh]">
        <div className="overflow-hidden mb-[1vw]">
          <motion.h2
            className="text-[4vw] font-display font-bold text-white tracking-tight"
            initial={{ y: 80, opacity: 0 }}
            animate={
              phase >= 4 ? { y: -50, opacity: 0 } :
              phase >= 1 ? { y: 0, opacity: 1 } :
              { y: 80, opacity: 0 }
            }
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            Everything your <span className="text-gradient-primary">organization needs</span>
          </motion.h2>
        </div>
        <motion.p
          className="text-[1.5vw] text-text-secondary"
          initial={{ opacity: 0, y: 20 }}
          animate={
            phase >= 4 ? { opacity: 0, y: -20 } :
            phase >= 2 ? { opacity: 1, y: 0 } :
            { opacity: 0, y: 20 }
          }
          transition={{ duration: 0.6 }}
        >
          A complete suite of tools to scale your operations.
        </motion.p>
      </div>

      <div className="grid grid-cols-4 gap-[2vw] max-w-[80vw] mx-auto relative z-20">
        {FEATURES.map((feat, idx) => (
          <motion.div
            key={feat.title}
            className="bg-bg-muted/80 backdrop-blur-md border border-white/10 rounded-[1vw] p-[1.5vw] shadow-xl flex flex-col items-start"
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={
              phase >= 4 ? { opacity: 0, y: 50, scale: 0.9 } :
              phase >= 3 ? { opacity: 1, y: 0, scale: 1 } :
              { opacity: 0, y: 50, scale: 0.9 }
            }
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 25,
              delay: phase === 3 ? idx * 0.1 : 0,
            }}
          >
            <div className="mb-[1vw] bg-white/5 w-[3.5vw] h-[3.5vw] flex items-center justify-center rounded-[0.8vw] text-primary">
              <feat.icon className="w-[1.8vw] h-[1.8vw]" />
            </div>
            <h3 className="text-white font-bold text-[1.2vw] mb-[0.3vw]">{feat.title}</h3>
            <p className="text-text-secondary text-[0.9vw] leading-snug">{feat.desc}</p>
          </motion.div>
        ))}
      </div>

      {/* Decorative Background Mesh */}
      <motion.div
        className="absolute inset-0 z-0 pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{ opacity: phase >= 1 && phase < 4 ? 0.3 : 0 }}
        transition={{ duration: 1 }}
      >
        <div 
          className="absolute inset-0"
          style={{
            backgroundImage: `radial-gradient(circle at center, var(--color-primary) 1px, transparent 1px)`,
            backgroundSize: '3vw 3vw',
            backgroundPosition: 'center',
            maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 70%)',
            WebkitMaskImage: 'radial-gradient(ellipse at center, black 40%, transparent 70%)'
          }}
        />
      </motion.div>
    </motion.div>
  );
};
