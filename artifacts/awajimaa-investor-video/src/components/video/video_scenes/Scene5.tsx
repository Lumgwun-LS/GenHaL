import { motion } from 'framer-motion';

export function Scene5() {
  return (
    <motion.div
      className="absolute inset-0 w-full h-full flex bg-[#020617]"
      initial={{ clipPath: 'inset(100% 0 0 0)' }}
      animate={{ clipPath: 'inset(0% 0 0 0)' }}
      exit={{ opacity: 0, scale: 1.1 }}
      transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="absolute inset-0 w-full h-full">
        <video
          src={`${import.meta.env.BASE_URL}videos/entrepreneur.mp4`}
          autoPlay
          muted
          loop
          playsInline
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#020617] via-[#020617]/70 to-transparent" />
      </div>

      <div className="relative z-10 w-full h-full flex flex-col justify-center px-24">
        <motion.div
          className="w-full max-w-4xl"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8, duration: 1.2 }}
        >
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-1 bg-blue-500 rounded-full" />
            <h3 className="text-blue-400 tracking-[0.2em] uppercase font-bold text-sm">Platform 03</h3>
          </div>
          
          <h2 className="text-6xl md:text-[5vw] font-display font-bold text-white mb-8 leading-tight">
            AWA BIZ SUITE
          </h2>
          
          <h3 className="text-3xl text-gray-300 font-light mb-16 border-l-4 border-blue-500 pl-6">
            The African Business OS.
            <br />
            <span className="text-blue-400 font-medium">Powering millions of SMEs.</span>
          </h3>

          <div className="grid grid-cols-2 gap-x-12 gap-y-8">
            {[
              "Complete CRM & Inventory",
              "Omnichannel Payments",
              "Instant Mobile App Builder",
              "AI-driven Voice Campaigns"
            ].map((item, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 + i * 0.1, duration: 0.8 }}
              >
                <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/50 flex items-center justify-center shrink-0">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                </div>
                <p className="text-xl text-white font-medium">{item}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}