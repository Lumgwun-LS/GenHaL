import { motion } from 'framer-motion';

const PLATFORMS = [
  { label: 'Meta', color: '#1877F2', connected: true },
  { label: 'X', color: '#e7e7e7', connected: true },
  { label: 'LinkedIn', color: '#0A66C2', connected: false },
];

const CAMPAIGNS = [
  { name: 'Summer Promo', platform: 'Meta', color: '#1877F2', impressions: '842K', status: 'active' },
  { name: 'Brand Reach Q3', platform: 'X', color: '#e7e7e7', impressions: '391K', status: 'paused' },
];

const BAR_HEIGHTS = [30, 50, 44, 68, 82, 61, 100];

export default function Scene6() {
  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center px-[10vw] z-40 bg-[#05050A]"
      initial={{ y: '100vh' }}
      animate={{ y: 0 }}
      exit={{ y: '-100vh', opacity: 0 }}
      transition={{ duration: 0.9, ease: [0.7, 0, 0.3, 1] }}
    >
      {/* ── Left — Ads Manager UI mockup ─────────────────────────────────── */}
      <div className="w-[42vw] flex justify-center items-center relative h-[70vh]">
        <motion.div
          className="relative w-[38vw] h-[58vh] rounded-[1.5vw] border-2 border-white/10 flex flex-col overflow-hidden"
          style={{ background: 'rgba(10,8,20,0.95)', backdropFilter: 'blur(20px)' }}
          initial={{ opacity: 0, scale: 0.9, rotate: -3 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ delay: 0.7, type: 'spring', stiffness: 90 }}
        >
          {/* Tab bar */}
          <div className="flex items-center gap-[1.5vw] px-[1.5vw] py-[0.9vw] border-b border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
            {['Contacts', 'Creator', 'Manager', 'Analytics', 'Email'].map((tab) => (
              <div
                key={tab}
                className="text-[0.7vw] font-semibold px-[0.8vw] py-[0.3vw] rounded-full"
                style={tab === 'Manager' ? {
                  background: 'linear-gradient(135deg, rgba(127,80,255,0.25), rgba(255,127,80,0.15))',
                  color: '#c4a0ff',
                  border: '1px solid rgba(127,80,255,0.4)',
                } : { color: 'rgba(255,255,255,0.35)' }}
              >
                {tab}
              </div>
            ))}
          </div>

          <div className="flex-1 overflow-hidden px-[1.4vw] py-[1vw] flex flex-col gap-[1vw]">

            {/* Platform connections */}
            <motion.div
              className="rounded-[0.8vw] p-[0.9vw] border"
              style={{ backgroundColor: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.07)' }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
            >
              <p className="text-[0.6vw] font-bold uppercase tracking-widest mb-[0.7vw]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                Platform Connections
              </p>
              <div className="flex gap-[0.6vw]">
                {PLATFORMS.map((p) => (
                  <div
                    key={p.label}
                    className="flex items-center gap-[0.4vw] px-[0.7vw] py-[0.3vw] rounded-full text-[0.65vw] font-semibold"
                    style={{
                      backgroundColor: p.connected ? `${p.color}18` : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${p.connected ? `${p.color}44` : 'rgba(255,255,255,0.08)'}`,
                      color: p.connected ? p.color : 'rgba(255,255,255,0.3)',
                    }}
                  >
                    {p.label}
                    {p.connected
                      ? <span className="w-[0.4vw] h-[0.4vw] rounded-full bg-green-400" />
                      : <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: '0.55vw' }}>pending</span>
                    }
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Campaigns */}
            <div className="flex flex-col gap-[0.6vw]">
              {CAMPAIGNS.map((c, i) => (
                <motion.div
                  key={c.name}
                  className="flex items-center gap-[0.9vw] rounded-[0.7vw] p-[0.75vw]"
                  style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 1.3 + i * 0.15, type: 'spring', stiffness: 100 }}
                >
                  <div
                    className="w-[2.2vw] h-[2.2vw] rounded-[0.5vw] flex items-center justify-center text-[0.9vw] font-black shrink-0"
                    style={{ backgroundColor: `${c.color}20`, color: c.color }}
                  >
                    {c.platform === 'Meta' ? 'ƒ' : '✕'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-[0.75vw] truncate">{c.name}</p>
                    <p className="text-[0.62vw]" style={{ color: 'rgba(255,255,255,0.35)' }}>{c.platform} · {c.impressions} impressions</p>
                  </div>
                  <div
                    className="px-[0.6vw] py-[0.2vw] rounded-full text-[0.58vw] font-bold shrink-0"
                    style={{
                      backgroundColor: c.status === 'active' ? 'rgba(34,197,94,0.12)' : 'rgba(255,255,255,0.05)',
                      color: c.status === 'active' ? '#4ade80' : 'rgba(255,255,255,0.35)',
                      border: c.status === 'active' ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {c.status}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Mini chart */}
            <motion.div
              className="flex-1 rounded-[0.8vw] p-[0.9vw] border flex flex-col justify-between"
              style={{ backgroundColor: 'rgba(127,80,255,0.05)', borderColor: 'rgba(127,80,255,0.2)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.7 }}
            >
              <p className="text-[0.6vw] font-bold uppercase tracking-widest" style={{ color: 'rgba(127,80,255,0.75)' }}>7-Day Impressions</p>
              <div className="flex items-end gap-[0.35vw] h-[3.5vh] mt-[0.5vh]">
                {BAR_HEIGHTS.map((h, i) => (
                  <motion.div
                    key={i}
                    className="flex-1 rounded-t-[0.2vw]"
                    style={{ height: `${h}%`, background: 'linear-gradient(to top, #7F50FF, #FF7F50)', transformOrigin: 'bottom' }}
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: 1.8 + i * 0.05, duration: 0.35, ease: 'easeOut' }}
                  />
                ))}
              </div>
            </motion.div>
          </div>
        </motion.div>
      </div>

      {/* ── Right — copy ─────────────────────────────────────────────────── */}
      <div className="w-[38vw] flex flex-col justify-center pl-[2vw]">
        <motion.p
          className="text-[0.9vw] font-bold uppercase tracking-widest mb-[1.5vh]"
          style={{ color: '#FF7F50' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
        >
          Ads Suite
        </motion.p>

        <motion.h2
          className="text-[4vw] font-display font-bold leading-tight mb-[3vh]"
          initial={{ opacity: 0, y: '4vh' }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.8 }}
        >
          Ads That<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7F50FF] to-[#FF7F50]">
            Actually Convert.
          </span>
        </motion.h2>

        <motion.p
          className="text-[1.2vw] text-gray-300 max-w-[32vw] leading-relaxed mb-[3vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2, duration: 0.8 }}
        >
          Build and publish campaigns to Meta and X — AI writes the copy, generates the creative, and tracks every click. Contact targeting, email campaigns, and real-time analytics included.
        </motion.p>

        <motion.div
          className="flex flex-col gap-[1.2vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.8 }}
        >
          {[
            '📣  Multi-platform publish — Meta, X, and more',
            '🤖  AI copy + image generation in one wizard',
            '📊  Live analytics with impressions & CTR',
            '✉️  Email campaigns to segmented contacts',
          ].map((item) => (
            <div key={item} className="flex items-center gap-[0.8vw] text-[0.95vw] text-gray-300">
              <span>{item}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </motion.div>
  );
}
