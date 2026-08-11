import { motion } from 'framer-motion';

export function Scene4() {
  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex bg-[#0f0a00]"
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="absolute inset-0 w-full h-full">
        <video
          src={`${import.meta.env.BASE_URL}videos/marketplace.mp4`}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0f0a00] via-[#0f0a00]/80 to-transparent" />
      </div>

      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center text-center px-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 1, type: "spring" }}
          className="mb-8 p-6 rounded-full glass-panel inline-flex items-center justify-center"
        >
          <img 
            src="https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/app-store/media/1785809891139-c7a0db95f5b4.jpg" 
            alt="Logo" 
            className="w-20 h-20 rounded-full shadow-[0_0_30px_rgba(245,158,11,0.5)] object-cover"
          />
        </motion.div>

        <motion.h3 
          className="text-accent tracking-[0.3em] uppercase font-bold text-sm mb-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          Platform 02
        </motion.h3>

        <motion.h2 
          className="text-6xl md:text-8xl font-display font-bold text-white mb-6"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 1 }}
        >
          AWA HUB
        </motion.h2>

        <motion.p 
          className="text-3xl text-gradient-gold font-medium mb-12 max-w-3xl"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 1 }}
        >
          Africa's Connected Marketplace.
        </motion.p>

        <div className="flex gap-8 flex-wrap justify-center max-w-4xl">
          {[
            { title: "B2B Networking", desc: "Digital Business Book" },
            { title: "Logistics", desc: "Multi-vendor transport" },
            { title: "Insurance", desc: "Digital protection" }
          ].map((item, i) => (
            <motion.div
              key={item.title}
              className="glass-panel p-6 rounded-2xl w-64 text-left border-t border-white/10"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5 + i * 0.15, duration: 0.8, type: "spring" }}
            >
              <h4 className="text-xl font-bold text-white mb-2">{item.title}</h4>
              <p className="text-gray-400 text-sm">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}