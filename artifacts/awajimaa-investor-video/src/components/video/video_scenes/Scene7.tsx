import { motion } from 'framer-motion';

export function Scene7() {
  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex bg-[#000000]"
      initial={{ opacity: 0, rotateY: 90 }}
      animate={{ opacity: 1, rotateY: 0 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
      style={{ perspective: 2000 }}
    >
      <div className="absolute inset-0 w-full h-full">
        <video
          src={`${import.meta.env.BASE_URL}videos/network_africa.mp4`}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-50 hue-rotate-180"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-black" />
      </div>

      <div className="relative z-10 w-full h-full flex items-center">
        <div className="w-1/2 flex justify-center">
          <motion.div
            className="w-80 h-80 rounded-[3rem] bg-gradient-to-br from-primary/20 to-accent/20 border border-white/20 backdrop-blur-xl flex items-center justify-center shadow-2xl relative"
            initial={{ scale: 0.5, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ delay: 0.8, duration: 1.2, type: "spring" }}
          >
            <div className="absolute inset-0 rounded-[3rem] border-2 border-white/10" />
            <img 
              src="https://pub-07bed37fd4bf4c02b66107ecb2a7686d.r2.dev/app-store/media/1785809891139-c7a0db95f5b4.jpg" 
              alt="Logo" 
              className="w-40 h-40 rounded-full shadow-[0_0_50px_rgba(255,255,255,0.2)] object-cover"
            />
          </motion.div>
        </div>

        <div className="w-1/2 pr-24">
          <motion.h3 
            className="text-white/50 tracking-[0.3em] uppercase font-bold text-sm mb-4"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1, duration: 0.8 }}
          >
            Platform 06
          </motion.h3>
          <motion.h2 
            className="text-6xl md:text-7xl font-display font-bold text-white mb-6"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.1, duration: 0.8 }}
          >
            AWAJIMAA <br/>APP STORE
          </motion.h2>
          <motion.p 
            className="text-3xl text-gradient font-medium mb-10"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 1.2, duration: 0.8 }}
          >
            Africa's App Marketplace.
          </motion.p>

          <div className="flex flex-col gap-6">
            <motion.div 
              className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.4, duration: 0.8 }}
            >
              <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                <div className="w-4 h-4 bg-primary rounded-sm rotate-45" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg">The Distribution Layer</h4>
                <p className="text-gray-400 text-sm">For African-built applications</p>
              </div>
            </motion.div>

            <motion.div 
              className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 0.8 }}
            >
              <div className="w-12 h-12 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                <div className="w-4 h-4 bg-accent rounded-full" />
              </div>
              <div>
                <h4 className="text-white font-bold text-lg">AI-Reviewed & Vetted</h4>
                <p className="text-gray-400 text-sm">Curated specifically for African users</p>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}