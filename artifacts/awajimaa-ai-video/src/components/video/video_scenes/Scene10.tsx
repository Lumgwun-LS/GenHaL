import { motion } from 'framer-motion';

const CATEGORIES = [
  { emoji: '🏗️', label: 'Building Design',    sub: 'Houses, offices & renovations',    color: 'from-slate-500/30 to-slate-700/20',   border: 'border-slate-400/30' },
  { emoji: '🎨', label: 'Business Branding',   sub: 'Logos, identity & brand assets',   color: 'from-violet-500/30 to-fuchsia-700/20', border: 'border-violet-400/30' },
  { emoji: '👗', label: 'Fashion & Tailoring', sub: 'Ankara, Agbada & modern cuts',     color: 'from-rose-500/30 to-pink-700/20',     border: 'border-rose-400/30' },
  { emoji: '🛋️', label: 'Interior Design',     sub: 'Rooms, décor & furniture layout',  color: 'from-amber-500/30 to-orange-700/20',  border: 'border-amber-400/30' },
];

export function Scene10() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-row items-center justify-between px-[8vw]"
      initial={{ opacity: 0, x: '100vw' }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: '-50vw', filter: 'blur(10px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Left copy */}
      <div className="w-[42%] pr-10 z-10 flex flex-col gap-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8 }}
        >
          <p className="text-violet-400 uppercase tracking-[0.25em] text-sm font-semibold mb-3">Powered by DALL·E 3</p>
          <h2 className="text-6xl font-bold text-white leading-tight">
            <span className="text-gradient">AI Design</span><br />Studio
          </h2>
        </motion.div>

        <motion.p
          className="text-xl text-white/60 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.8 }}
        >
          Describe your vision. Get a professional design in seconds — watermarked and ready to download.
        </motion.p>

        {/* Style pills */}
        <motion.div
          className="flex flex-wrap gap-2 mt-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1, duration: 0.6 }}
        >
          {['Photorealistic', '3D Render', 'Watercolor', 'Blueprint'].map((s, i) => (
            <span key={i} className="px-3 py-1 rounded-full border border-white/20 bg-white/5 text-white/70 text-sm backdrop-blur-sm">
              {s}
            </span>
          ))}
        </motion.div>
      </div>

      {/* Right: 2×2 category grid */}
      <div className="w-[52%] grid grid-cols-2 gap-4">
        {CATEGORIES.map((cat, i) => (
          <motion.div
            key={i}
            className={`bg-gradient-to-br ${cat.color} backdrop-blur-xl border ${cat.border} rounded-2xl p-5 flex flex-col gap-3`}
            initial={{ opacity: 0, y: 40, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.6 + i * 0.18, duration: 0.7, type: 'spring', bounce: 0.3 }}
            whileHover={{ scale: 1.03 }}
          >
            <div className="text-4xl">{cat.emoji}</div>
            <div>
              <p className="text-white font-semibold text-lg leading-tight">{cat.label}</p>
              <p className="text-white/50 text-sm mt-1 leading-snug">{cat.sub}</p>
            </div>
            {/* Fake "generated image" placeholder */}
            <motion.div
              className="w-full h-20 rounded-xl bg-white/5 border border-white/10 overflow-hidden relative"
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, delay: i * 0.5 }}
            >
              <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
              <div className="absolute bottom-2 right-2 bg-black/50 text-white/60 text-[10px] px-2 py-0.5 rounded-full">
                Awajimaa AI
              </div>
            </motion.div>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
