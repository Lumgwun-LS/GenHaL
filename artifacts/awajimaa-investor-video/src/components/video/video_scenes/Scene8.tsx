import { motion } from 'framer-motion';

export function Scene8() {
  const platforms = [
    { title: "Emergency", color: "#ef4444" },
    { title: "Commerce", color: "#3b82f6" },
    { title: "Business", color: "#a855f7" },
    { title: "Education", color: "#10b981" },
    { title: "Heritage", color: "#f59e0b" },
    { title: "Distribution", color: "#14b8a6" }
  ];

  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-[#050505]"
      initial={{ clipPath: 'polygon(50% 50%, 50% 50%, 50% 50%, 50% 50%)' }}
      animate={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' }}
      exit={{ filter: 'blur(30px)', opacity: 0 }}
      transition={{ duration: 1.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-800 via-[#050505] to-[#050505]" />
      </div>

      <div className="relative z-10 w-full max-w-6xl px-12 text-center">
        <motion.div 
          className="flex flex-wrap justify-center gap-4 mb-16"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 1 }}
        >
          {platforms.map((p, i) => (
            <motion.div
              key={p.title}
              className="px-6 py-3 rounded-full border border-white/20 glass-panel flex items-center gap-3"
              initial={{ opacity: 0, scale: 0.8, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ delay: 1 + i * 0.1, duration: 0.6, type: "spring" }}
            >
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-white font-medium tracking-wide">{p.title}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-6xl md:text-[5vw] font-display font-bold text-white leading-tight mb-8">
            These are not isolated apps.
          </h2>
          <h3 className="text-4xl md:text-5xl font-light text-gradient-gold">
            A full-stack civilization infrastructure.
          </h3>
        </motion.div>
      </div>
    </motion.div>
  );
}