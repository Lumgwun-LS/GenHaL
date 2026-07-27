import { motion } from 'framer-motion';

const TOOLS = [
  { icon: '🗂️', label: 'Media Library',            sub: 'All AI & uploaded assets in one searchable hub' },
  { icon: '🌐', label: 'Business Website Builder',  sub: '4 templates, SEO controls, live public URL' },
  { icon: '📊', label: 'Spreadsheet Intelligence',  sub: 'Ask AI questions on any CSV or Excel upload' },
  { icon: '🎙️', label: 'AI Quick Create',           sub: 'Create records by voice or chat in seconds' },
  { icon: '🏢', label: 'Multi-Vendor Management',   sub: 'Manage dozens of brands from one login' },
];

export function Scene11() {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center px-[8vw]"
      initial={{ opacity: 0, y: 60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: '-50vw', filter: 'blur(10px)' }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Header */}
      <motion.div
        className="text-center mb-10"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.8 }}
      >
        <p className="text-violet-400 uppercase tracking-[0.25em] text-sm font-semibold mb-3">The Complete Suite</p>
        <h2 className="text-6xl font-bold text-white leading-tight">
          Every Tool Your<br />
          <span className="text-gradient">Business Needs</span>
        </h2>
      </motion.div>

      {/* Tools row */}
      <div className="flex flex-row gap-4 w-full justify-center">
        {TOOLS.map((tool, i) => (
          <motion.div
            key={i}
            className="flex-1 max-w-[17%] bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-4 flex flex-col items-center text-center gap-3 hover:border-violet-400/40 transition-colors"
            initial={{ opacity: 0, y: 50, scale: 0.88 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.5 + i * 0.14, duration: 0.65, type: 'spring', bounce: 0.35 }}
          >
            <motion.div
              className="w-14 h-14 rounded-2xl bg-violet-600/20 border border-violet-400/20 flex items-center justify-center text-3xl"
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 3 + i * 0.4, repeat: Infinity, ease: 'easeInOut', delay: i * 0.3 }}
            >
              {tool.icon}
            </motion.div>
            <p className="text-white font-semibold text-sm leading-tight">{tool.label}</p>
            <p className="text-white/45 text-xs leading-snug">{tool.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Bottom tagline */}
      <motion.p
        className="text-white/40 text-lg mt-10 tracking-wide"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6, duration: 1 }}
      >
        One platform. Every capability.
      </motion.p>
    </motion.div>
  );
}
