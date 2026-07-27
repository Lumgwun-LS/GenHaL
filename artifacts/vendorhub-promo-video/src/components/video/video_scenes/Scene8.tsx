import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const APP_CARDS = [
  { name: 'AgroPay', cat: 'Fintech', color: '#22c55e', icon: '🌾' },
  { name: 'EduNaija', cat: 'Education', color: '#7F50FF', icon: '📚' },
  { name: 'MarketHub', cat: 'Business', color: '#FF7F50', icon: '🛍️' },
  { name: 'HealthLink', cat: 'Health', color: '#06b6d4', icon: '❤️' },
  { name: 'TechTools', cat: 'Technology', color: '#f59e0b', icon: '⚙️' },
  { name: 'MoneyWise', cat: 'Finance', color: '#10b981', icon: '💰' },
];

export const Scene8 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 300),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1600),
      setTimeout(() => setPhase(4), 2400),
      setTimeout(() => setPhase(5), 6500), // Exit
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(8px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Left side — copy */}
      <div className="absolute left-[8vw] top-1/2 -translate-y-1/2 max-w-[38vw] z-20">

        {/* Eyebrow */}
        <div className="overflow-hidden mb-[1vw]">
          <motion.p
            className="text-[1vw] font-bold tracking-widest uppercase"
            style={{ color: '#FF7F50' }}
            initial={{ y: 40, opacity: 0 }}
            animate={
              phase >= 5 ? { y: -20, opacity: 0 } :
              phase >= 1 ? { y: 0, opacity: 1 } :
              { y: 40, opacity: 0 }
            }
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            Awajimaa App Store
          </motion.p>
        </div>

        {/* Headline */}
        <div className="overflow-hidden mb-[1.5vw]">
          <motion.h2
            className="text-[3.8vw] font-display font-black text-white leading-tight"
            initial={{ y: 80, opacity: 0 }}
            animate={
              phase >= 5 ? { y: -60, opacity: 0 } :
              phase >= 2 ? { y: 0, opacity: 1 } :
              { y: 80, opacity: 0 }
            }
            transition={{ duration: 0.85, ease: [0.22, 1, 0.36, 1] }}
          >
            Africa's App<br />
            <span style={{
              backgroundImage: 'linear-gradient(135deg, #7F50FF 0%, #FF7F50 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Marketplace.
            </span>
          </motion.h2>
        </div>

        {/* Sub-copy */}
        <motion.p
          className="text-[1.4vw] mb-[2vw] leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.6)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={
            phase >= 5 ? { opacity: 0, y: -20 } :
            phase >= 3 ? { opacity: 1, y: 0 } :
            { opacity: 0, y: 20 }
          }
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          AI-reviewed apps for business, school, money &amp; tech —<br />
          across all <strong style={{ color: 'white' }}>54 African countries.</strong>
        </motion.p>

        {/* Stats row */}
        <motion.div
          className="flex items-center gap-[2vw]"
          initial={{ opacity: 0, y: 20 }}
          animate={
            phase >= 5 ? { opacity: 0, y: -20 } :
            phase >= 4 ? { opacity: 1, y: 0 } :
            { opacity: 0, y: 20 }
          }
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          {[
            { val: '54', label: 'Countries' },
            { val: 'AI', label: 'Reviewed' },
            { val: '₦0', label: 'To Browse' },
          ].map(({ val, label }) => (
            <div key={label} className="text-center">
              <p className="text-[2.2vw] font-black text-white leading-none">{val}</p>
              <p className="text-[0.85vw] font-medium mt-[0.3vw]" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</p>
            </div>
          ))}
        </motion.div>

        {/* URL chip */}
        <motion.div
          className="mt-[2vw] inline-flex items-center gap-[0.6vw] px-[1.2vw] py-[0.5vw] rounded-full border"
          style={{ borderColor: 'rgba(127,80,255,0.4)', backgroundColor: 'rgba(127,80,255,0.08)' }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={
            phase >= 5 ? { opacity: 0, scale: 0.9 } :
            phase >= 4 ? { opacity: 1, scale: 1 } :
            { opacity: 0, scale: 0.9 }
          }
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="w-[0.8vw] h-[0.8vw] rounded-full bg-green-400 animate-pulse" />
          <span className="text-[0.9vw] font-mono font-medium text-white/70">awajimaaappstore.com</span>
        </motion.div>
      </div>

      {/* Right side — floating app cards grid */}
      <div className="absolute right-[4vw] top-1/2 -translate-y-1/2 w-[46vw] h-[75vh] pointer-events-none">

        {/* Store browser chrome */}
        <motion.div
          className="absolute inset-0 rounded-[2vw] border overflow-hidden"
          style={{
            backgroundColor: 'rgba(10,8,20,0.85)',
            borderColor: 'rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
            transformPerspective: 1200,
          }}
          initial={{ scale: 0.85, opacity: 0, rotateY: 15, rotateX: 8 }}
          animate={
            phase >= 5 ? { scale: 1.1, opacity: 0, x: 120 } :
            phase >= 1 ? { scale: 1, opacity: 1, rotateY: -4, rotateX: 3 } :
            { scale: 0.85, opacity: 0, rotateY: 15, rotateX: 8 }
          }
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] as never }}
        >
          {/* Browser top bar */}
          <div className="flex items-center gap-[0.8vw] px-[1.5vw] py-[1vw] border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex gap-[0.4vw]">
              <div className="w-[1vw] h-[1vw] rounded-full bg-red-500/60" />
              <div className="w-[1vw] h-[1vw] rounded-full bg-yellow-500/60" />
              <div className="w-[1vw] h-[1vw] rounded-full bg-green-500/60" />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="px-[2vw] py-[0.35vw] rounded-full text-[0.75vw] font-mono" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>
                awajimaaappstore.com
              </div>
            </div>
          </div>

          {/* Store heading inside */}
          <div className="px-[2vw] pt-[1.2vw] pb-[0.8vw]">
            <p className="text-[0.8vw] font-bold tracking-widest uppercase mb-[0.3vw]" style={{ color: '#FF7F50' }}>Featured Apps</p>
            <p className="text-white text-[1.2vw] font-bold">Built for Africa</p>
          </div>

          {/* App cards grid */}
          <div className="px-[2vw] pb-[2vw] grid grid-cols-3 gap-[1vw]">
            {APP_CARDS.map((app, i) => (
              <motion.div
                key={app.name}
                className="rounded-[1vw] p-[1vw] flex flex-col gap-[0.5vw]"
                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={
                  phase >= 5 ? { opacity: 0, y: -10 } :
                  phase >= 2 ? { opacity: 1, y: 0, scale: 1 } :
                  { opacity: 0, y: 20, scale: 0.9 }
                }
                transition={{ duration: 0.6, delay: phase === 2 ? i * 0.08 : 0, ease: [0.22, 1, 0.36, 1] }}
              >
                <div
                  className="w-[3.5vw] h-[3.5vw] rounded-[0.8vw] flex items-center justify-center text-[1.6vw]"
                  style={{ backgroundColor: `${app.color}20` }}
                >
                  {app.icon}
                </div>
                <p className="text-white font-bold text-[0.85vw] leading-tight">{app.name}</p>
                <p className="text-[0.7vw] font-medium" style={{ color: app.color }}>{app.cat}</p>
                <div
                  className="mt-[0.3vw] px-[0.6vw] py-[0.25vw] rounded-full text-[0.65vw] font-bold text-center"
                  style={{ backgroundColor: `${app.color}25`, color: app.color }}
                >
                  Get App
                </div>
              </motion.div>
            ))}
          </div>

          {/* AI Review badge */}
          <motion.div
            className="absolute bottom-[1.5vw] right-[1.5vw] flex items-center gap-[0.6vw] px-[1vw] py-[0.5vw] rounded-full"
            style={{ backgroundColor: 'rgba(127,80,255,0.15)', border: '1px solid rgba(127,80,255,0.3)' }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={
              phase >= 5 ? { opacity: 0 } :
              phase >= 3 ? { opacity: 1, scale: 1 } :
              { opacity: 0, scale: 0.8 }
            }
            transition={{ duration: 0.5, ease: 'easeOut' }}
          >
            <div className="w-[0.7vw] h-[0.7vw] rounded-full" style={{ backgroundColor: '#7F50FF' }} />
            <span className="text-[0.7vw] font-bold text-white/80">AI Reviewed</span>
          </motion.div>
        </motion.div>

        {/* Floating countries badge */}
        <motion.div
          className="absolute -left-[6vw] top-[20%] px-[1.2vw] py-[0.8vw] rounded-[1vw] flex items-center gap-[0.8vw]"
          style={{ backgroundColor: 'rgba(10,8,20,0.9)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(12px)' }}
          initial={{ x: -40, opacity: 0 }}
          animate={
            phase >= 5 ? { x: -80, opacity: 0 } :
            phase >= 3 ? { x: 0, opacity: 1 } :
            { x: -40, opacity: 0 }
          }
          transition={{ type: 'spring', stiffness: 300, damping: 22, delay: phase === 3 ? 0.2 : 0 }}
        >
          <div className="text-[1.8vw]">🌍</div>
          <div>
            <p className="text-[0.75vw] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Coverage</p>
            <p className="text-white font-black text-[1.1vw]">54 Countries</p>
          </div>
        </motion.div>

        {/* Floating new app badge */}
        <motion.div
          className="absolute -right-[3vw] top-[60%] px-[1.2vw] py-[0.8vw] rounded-[1vw] flex items-center gap-[0.8vw]"
          style={{ backgroundColor: 'rgba(10,8,20,0.9)', border: '1px solid rgba(34,197,94,0.3)', backdropFilter: 'blur(12px)' }}
          initial={{ x: 40, opacity: 0 }}
          animate={
            phase >= 5 ? { x: 80, opacity: 0 } :
            phase >= 4 ? { x: 0, opacity: 1 } :
            { x: 40, opacity: 0 }
          }
          transition={{ type: 'spring', stiffness: 300, damping: 22, delay: phase === 4 ? 0.1 : 0 }}
        >
          <div className="w-[1vw] h-[1vw] rounded-full bg-green-400 animate-pulse" />
          <div>
            <p className="text-[0.75vw] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>New Apps</p>
            <p className="text-white font-bold text-[0.95vw]">Live Today</p>
          </div>
        </motion.div>
      </div>

      {/* Accent lines */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-[15%] -left-[5%] w-[110%] h-[1px]"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(127,80,255,0.3), transparent)', rotate: '-3deg' }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={
            phase >= 5 ? { scaleX: 0, opacity: 0 } :
            phase >= 2 ? { scaleX: 1, opacity: 1 } :
            { scaleX: 0, opacity: 0 }
          }
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
        <motion.div
          className="absolute bottom-[15%] -left-[5%] w-[110%] h-[1px]"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,127,80,0.3), transparent)', rotate: '3deg' }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={
            phase >= 5 ? { scaleX: 0, opacity: 0 } :
            phase >= 3 ? { scaleX: 1, opacity: 1 } :
            { scaleX: 0, opacity: 0 }
          }
          transition={{ duration: 1.5, ease: 'easeOut' }}
        />
      </div>
    </motion.div>
  );
};
