import { motion } from 'framer-motion';

const CONTACTS = [
  { label: 'Email', value: 'admin@lumgwunsolutions.com' },
  { label: 'Email', value: 'awajimaaapps@gmail.com' },
  { label: 'Phone', value: '+234 706 724 6050' },
  { label: 'Phone', value: '+1 917 821 8640' },
];

export function Scene9() {
  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-black"
      initial={{ opacity: 0, scale: 1.2 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 w-full h-full">
        <video
          src={`${import.meta.env.BASE_URL}videos/cityscape.mp4`}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/85 to-black/50" />
      </div>

      <div className="relative z-10 w-full h-full flex flex-col items-center justify-between text-center py-14 px-8">

        {/* Top: Logo + Brand */}
        <div className="flex flex-col items-center">
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 1.5, type: "spring", stiffness: 100, damping: 20 }}
            className="mb-6 relative"
          >
            <div className="absolute inset-0 bg-accent blur-[80px] opacity-25 rounded-full" />
            <img
              src="https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/app-store/media/1785809891139-c7a0db95f5b4.jpg"
              alt="Awajimaa Logo"
              className="w-28 h-28 rounded-full border-2 border-white/20 object-cover shadow-[0_0_50px_rgba(255,255,255,0.1)]"
            />
          </motion.div>

          <motion.h2
            className="text-6xl md:text-[5.5vw] font-display font-bold text-white mb-3 tracking-tighter"
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4, duration: 1.2 }}
          >
            AWAJIMAA
          </motion.h2>

          <motion.p
            className="text-lg text-gray-400 font-light tracking-widest uppercase mb-5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8, duration: 1 }}
          >
            Built by Awajimaa Group · Gwun-orene · Lumgwun Solutions
          </motion.p>

          <motion.div
            className="px-8 py-4 border border-accent/40 rounded-full bg-accent/10"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 2.2, duration: 1, type: "spring" }}
          >
            <p className="text-xl md:text-2xl text-accent font-bold tracking-wide">
              Invest in the Future of Africa.
            </p>
          </motion.div>
        </div>

        {/* Bottom: Contact Details */}
        <motion.div
          className="w-full max-w-4xl"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 2.8, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Divider */}
          <div className="flex items-center gap-4 mb-7">
            <div className="flex-1 h-px bg-white/15" />
            <p className="text-white/50 text-xs tracking-[0.3em] uppercase font-semibold">
              Investor &amp; Subscriber Contact
            </p>
            <div className="flex-1 h-px bg-white/15" />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {CONTACTS.map((c, i) => (
              <motion.div
                key={c.value}
                className="flex flex-col items-center gap-1.5 px-4 py-4 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-sm"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 3.1 + i * 0.12, duration: 0.7, ease: 'circOut' }}
              >
                <span className="text-white/35 text-[10px] tracking-[0.2em] uppercase font-semibold">
                  {c.label}
                </span>
                <span className="text-white font-mono text-sm leading-snug break-all text-center">
                  {c.value}
                </span>
              </motion.div>
            ))}
          </div>

          {/* Tagline footer */}
          <motion.p
            className="text-white/25 text-xs tracking-widest uppercase mt-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 3.8, duration: 1 }}
          >
            Africa's Full-Stack Digital Infrastructure · awajimaaapps.com
          </motion.p>
        </motion.div>

      </div>
    </motion.div>
  );
}
