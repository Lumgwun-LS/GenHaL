import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';

const PLATFORMS = [
  { label: 'Meta', color: '#1877F2', icon: 'ƒ', status: 'connected' },
  { label: 'Instagram', color: '#E1306C', icon: '◈', status: 'connected' },
  { label: 'X / Twitter', color: '#e7e7e7', icon: '✕', status: 'connected' },
  { label: 'LinkedIn', color: '#0A66C2', icon: 'in', status: 'pending' },
  { label: 'Google Ads', color: '#EA4335', icon: 'G', status: 'pending' },
];

const CAMPAIGNS = [
  { name: 'Summer Promo — Lagos', platform: 'Meta', platformColor: '#1877F2', status: 'active', impressions: '842K', ctr: '3.4%' },
  { name: 'Brand Awareness Q3', platform: 'X', platformColor: '#e7e7e7', status: 'paused', impressions: '391K', ctr: '1.8%' },
];

export const Scene9 = () => {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 400),
      setTimeout(() => setPhase(2), 900),
      setTimeout(() => setPhase(3), 1600),
      setTimeout(() => setPhase(4), 2800),
      setTimeout(() => setPhase(5), 6300),
    ];
    return () => timers.forEach(t => clearTimeout(t));
  }, []);

  return (
    <motion.div
      className="absolute inset-0 z-10 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.95, filter: 'blur(8px)' }}
      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* ── Left — copy ─────────────────────────────────────────────────── */}
      <div className="absolute left-[8vw] top-1/2 -translate-y-1/2 max-w-[38vw] z-20">

        {/* Eyebrow */}
        <div className="overflow-hidden mb-[0.8vw]">
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
            Ads Suite
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
            Ads That Convert.<br />
            <span style={{
              backgroundImage: 'linear-gradient(135deg, #7F50FF 0%, #FF7F50 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              Every Platform.
            </span>
          </motion.h2>
        </div>

        {/* Subtext */}
        <motion.p
          className="text-[1.35vw] mb-[2vw] leading-relaxed"
          style={{ color: 'rgba(255,255,255,0.6)' }}
          initial={{ opacity: 0, y: 20 }}
          animate={
            phase >= 5 ? { opacity: 0, y: -20 } :
            phase >= 3 ? { opacity: 1, y: 0 } :
            { opacity: 0, y: 20 }
          }
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          Publish to Meta, X, and beyond — AI-written copy, smart contact
          targeting, real-time analytics, and email campaigns in one place.
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
            { val: '5+', label: 'Platforms' },
            { val: 'AI', label: 'Copywriter' },
            { val: 'Live', label: 'Analytics' },
          ].map(({ val, label }) => (
            <div key={label} className="text-center">
              <p className="text-[2.2vw] font-black text-white leading-none">{val}</p>
              <p className="text-[0.85vw] font-medium mt-[0.3vw]" style={{ color: 'rgba(255,255,255,0.45)' }}>{label}</p>
            </div>
          ))}
        </motion.div>

        {/* Live chip */}
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
          <span className="text-[0.9vw] font-mono font-medium text-white/70">Campaign launching…</span>
        </motion.div>
      </div>

      {/* ── Right — Ads Manager mockup ────────────────────────────────────── */}
      <div className="absolute right-[4vw] top-1/2 -translate-y-1/2 w-[46vw] h-[72vh] pointer-events-none">

        {/* Browser chrome */}
        <motion.div
          className="absolute inset-0 rounded-[2vw] border overflow-hidden flex flex-col"
          style={{
            backgroundColor: 'rgba(10,8,20,0.9)',
            borderColor: 'rgba(255,255,255,0.08)',
            backdropFilter: 'blur(20px)',
          }}
          initial={{ scale: 0.85, opacity: 0, rotateY: 15, rotateX: 8 }}
          animate={
            phase >= 5 ? { scale: 1.1, opacity: 0, x: 120 } :
            phase >= 1 ? { scale: 1, opacity: 1, rotateY: -4, rotateX: 3 } :
            { scale: 0.85, opacity: 0, rotateY: 15, rotateX: 8 }
          }
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Browser bar */}
          <div className="flex items-center gap-[0.8vw] px-[1.5vw] py-[0.9vw] border-b shrink-0" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <div className="flex gap-[0.4vw]">
              <div className="w-[0.9vw] h-[0.9vw] rounded-full bg-red-500/60" />
              <div className="w-[0.9vw] h-[0.9vw] rounded-full bg-yellow-500/60" />
              <div className="w-[0.9vw] h-[0.9vw] rounded-full bg-green-500/60" />
            </div>
            <div className="flex-1 flex items-center justify-center">
              <div className="px-[2vw] py-[0.3vw] rounded-full text-[0.7vw] font-mono" style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' }}>
                awabiz.suite / ads
              </div>
            </div>
          </div>

          {/* Ads Manager content */}
          <div className="flex-1 overflow-hidden px-[1.8vw] py-[1.3vw] flex flex-col gap-[1.2vw]">

            {/* Section: Platform Connections */}
            <motion.div
              className="rounded-[1vw] border p-[1vw]"
              style={{ backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.07)' }}
              initial={{ opacity: 0, y: 16 }}
              animate={
                phase >= 5 ? { opacity: 0 } :
                phase >= 2 ? { opacity: 1, y: 0 } :
                { opacity: 0, y: 16 }
              }
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="text-[0.75vw] font-bold tracking-wide uppercase mb-[0.8vw]" style={{ color: 'rgba(255,255,255,0.45)' }}>Platform Connections</p>
              <div className="flex gap-[0.7vw] flex-wrap">
                {PLATFORMS.map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center gap-[0.5vw] px-[0.8vw] py-[0.35vw] rounded-full text-[0.72vw] font-semibold"
                    style={{
                      backgroundColor: p.status === 'connected' ? `${p.color}22` : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${p.status === 'connected' ? `${p.color}55` : 'rgba(255,255,255,0.1)'}`,
                      color: p.status === 'connected' ? p.color : 'rgba(255,255,255,0.35)',
                    }}
                  >
                    <span style={{ fontWeight: 900, fontSize: '0.85vw' }}>{p.icon}</span>
                    {p.label}
                    {p.status === 'connected'
                      ? <span className="w-[0.5vw] h-[0.5vw] rounded-full bg-green-400 ml-[0.2vw]" />
                      : <span className="text-[0.6vw] opacity-60 ml-[0.1vw]">pending</span>
                    }
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Section: Campaigns */}
            <div className="flex flex-col gap-[0.7vw]">
              <p className="text-[0.75vw] font-bold tracking-wide uppercase" style={{ color: 'rgba(255,255,255,0.45)' }}>Active Campaigns</p>
              {CAMPAIGNS.map((c, i) => (
                <motion.div
                  key={c.name}
                  className="flex items-center gap-[1vw] rounded-[0.8vw] p-[0.9vw]"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                  initial={{ opacity: 0, x: 20 }}
                  animate={
                    phase >= 5 ? { opacity: 0 } :
                    phase >= 3 ? { opacity: 1, x: 0 } :
                    { opacity: 0, x: 20 }
                  }
                  transition={{ duration: 0.5, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                >
                  <div className="w-[2.5vw] h-[2.5vw] rounded-[0.6vw] flex items-center justify-center text-[1.1vw] font-black shrink-0" style={{ backgroundColor: `${c.platformColor}20`, color: c.platformColor }}>
                    {c.platform === 'Meta' ? 'ƒ' : '✕'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-[0.85vw] truncate">{c.name}</p>
                    <p className="text-[0.7vw]" style={{ color: 'rgba(255,255,255,0.4)' }}>{c.impressions} impressions · CTR {c.ctr}</p>
                  </div>
                  <div
                    className="px-[0.7vw] py-[0.25vw] rounded-full text-[0.65vw] font-bold shrink-0"
                    style={{
                      backgroundColor: c.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
                      color: c.status === 'active' ? '#4ade80' : 'rgba(255,255,255,0.4)',
                      border: c.status === 'active' ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    {c.status}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Mini analytics bar chart */}
            <motion.div
              className="flex-1 rounded-[1vw] border p-[1vw] flex flex-col justify-between"
              style={{ backgroundColor: 'rgba(127,80,255,0.06)', borderColor: 'rgba(127,80,255,0.2)' }}
              initial={{ opacity: 0 }}
              animate={
                phase >= 5 ? { opacity: 0 } :
                phase >= 4 ? { opacity: 1 } :
                { opacity: 0 }
              }
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="text-[0.7vw] font-bold tracking-wide uppercase" style={{ color: 'rgba(127,80,255,0.8)' }}>Impressions — Last 7 Days</p>
              <div className="flex items-end gap-[0.4vw] h-[4.5vh]">
                {[35, 55, 48, 72, 88, 65, 100].map((h, i) => (
                  <motion.div
                    key={i}
                    className="flex-1 rounded-t-[0.3vw]"
                    style={{ background: 'linear-gradient(to top, #7F50FF, #FF7F50)' }}
                    initial={{ scaleY: 0 }}
                    animate={phase >= 4 ? { scaleY: 1 } : { scaleY: 0 }}
                    style2={{ originY: 1 }}
                    transition={{ duration: 0.4, delay: i * 0.06, ease: 'easeOut' }}
                  >
                    <div style={{ height: `${h}%`, background: 'linear-gradient(to top, #7F50FF, #FF7F50)', borderRadius: '0.3vw 0.3vw 0 0' }} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </motion.div>

        {/* Floating: 1.2M impressions badge */}
        <motion.div
          className="absolute -left-[7vw] top-[22%] px-[1.2vw] py-[0.8vw] rounded-[1vw] flex items-center gap-[0.8vw]"
          style={{ backgroundColor: 'rgba(10,8,20,0.9)', border: '1px solid rgba(127,80,255,0.3)', backdropFilter: 'blur(12px)' }}
          initial={{ x: -40, opacity: 0 }}
          animate={
            phase >= 5 ? { x: -80, opacity: 0 } :
            phase >= 4 ? { x: 0, opacity: 1 } :
            { x: -40, opacity: 0 }
          }
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
        >
          <div className="text-[1.8vw]">📊</div>
          <div>
            <p className="text-[0.75vw] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Total Reach</p>
            <p className="text-white font-black text-[1.1vw]">1.2M Impressions</p>
          </div>
        </motion.div>

        {/* Floating: Campaign Live badge */}
        <motion.div
          className="absolute -right-[3vw] top-[58%] px-[1.2vw] py-[0.8vw] rounded-[1vw] flex items-center gap-[0.8vw]"
          style={{ backgroundColor: 'rgba(10,8,20,0.9)', border: '1px solid rgba(34,197,94,0.3)', backdropFilter: 'blur(12px)' }}
          initial={{ x: 40, opacity: 0 }}
          animate={
            phase >= 5 ? { x: 80, opacity: 0 } :
            phase >= 4 ? { x: 0, opacity: 1 } :
            { x: 40, opacity: 0 }
          }
          transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.1 }}
        >
          <div className="w-[1vw] h-[1vw] rounded-full bg-green-400 animate-pulse" />
          <div>
            <p className="text-[0.75vw] font-medium" style={{ color: 'rgba(255,255,255,0.5)' }}>Campaign</p>
            <p className="text-white font-bold text-[0.95vw]">Live on Meta</p>
          </div>
        </motion.div>
      </div>

      {/* Accent lines */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div
          className="absolute top-[15%] -left-[5%] w-[110%] h-[1px]"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(127,80,255,0.3), transparent)', rotate: '-2deg' }}
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
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,127,80,0.3), transparent)', rotate: '2deg' }}
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
